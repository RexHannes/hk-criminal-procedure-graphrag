const fs = require("fs");
const path = require("path");
const {
  embeddingVectorSpaceId,
  isProductionScaleMode,
  resolveQdrantCollection,
  runtimeIsolationReport,
  vectorNamespaceSuffix,
} = require("../retrieval/runtime_isolation");

const {
  isCriminalDomainRetrievalScopeEnforced,
  retrievalScopePolicy,
} = require("./scale_ingest_safeguards");

const ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_PLAN_PATH = path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "scale_plan_20k.json");
const DEFAULT_BATCH_DIR = path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "bail_public_batch_v1");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const [key, ...rest] = line.split("=");
    const value = rest.join("=").trim().replace(/^['"]|['"]$/g, "");
    if (value) env[key.trim()] = value;
  }
  return env;
}

function loadEnv({ root = ROOT, env = process.env } = {}) {
  return {
    ...parseEnvFile(path.join(root, ".env")),
    ...parseEnvFile(path.join(root, ".env.local")),
    ...env,
  };
}

function hasAny(env, names) {
  return names.some(name => Boolean(env[name]));
}

function providerName(env, primary, fallback, defaultValue) {
  return String(env[primary] || env[fallback] || defaultValue || "").trim().toLowerCase();
}

function isProductionEmbeddingReady(env) {
  const provider = providerName(env, "LEGAL_EMBEDDING_PROVIDER", "EMBEDDING_PROVIDER", "local-hash");
  if (["", "none", "local", "local-hash"].includes(provider)) return false;
  const requiredKeys = {
    openai: ["OPENAI_API_KEY"],
    openrouter: ["OPENROUTER_API_KEY"],
    voyage: ["VOYAGE_API_KEY"],
    cohere: ["COHERE_API_KEY"],
  };
  return hasAny(env, requiredKeys[provider] || ["LEGAL_EMBEDDING_API_KEY", "OPENAI_API_KEY", "VOYAGE_API_KEY", "COHERE_API_KEY"]);
}

function isProductionRerankReady(env) {
  const provider = providerName(env, "LEGAL_RERANK_PROVIDER", "RERANK_PROVIDER", "none");
  if (["", "none", "local"].includes(provider)) return false;
  const requiredKeys = {
    cohere: ["COHERE_API_KEY"],
    openrouter: ["OPENROUTER_API_KEY"],
    voyage: ["VOYAGE_API_KEY"],
  };
  return hasAny(env, requiredKeys[provider] || ["LEGAL_RERANK_API_KEY", "COHERE_API_KEY", "VOYAGE_API_KEY"]);
}

function isDurableOrchestrationReady(env) {
  return hasAny(env, ["INNGEST_EVENT_KEY", "INNGEST_SIGNING_KEY", "INNGEST_DEV"]) && hasAny(env, ["INNGEST_SIGNING_KEY", "INNGEST_DEV"]);
}

function artifactStats(batchDir = DEFAULT_BATCH_DIR) {
  const manifest = readJson(path.join(batchDir, "source_manifest.json"));
  const parseReport = readJson(path.join(batchDir, "parse_report.json"));
  const propositions = readJson(path.join(batchDir, "proposition_cards.json"));
  const links = readJson(path.join(batchDir, "proposition_node_links.json"));
  const propositionCards = propositions.proposition_cards || [];
  const answerSafe = propositionCards.filter(card => card.answer_safe === true || card.answer_layer_status === "answer_safe");
  const illicitNonCandidate = propositionCards.filter(card => {
    if (card.answer_safe === true || card.answer_layer_status === "answer_safe") return false;
    const state = card.review_state || card.review_status || "";
    const layer = card.answer_layer_status || "";
    return ["approved", "lawyer_reviewed", "answer_safe"].includes(state) || layer === "lawyer_reviewed";
  });
  const nonCandidate = propositionCards.filter(card => {
    const state = card.review_state || card.review_status || "";
    const layer = card.answer_layer_status || "";
    return card.answer_safe === true || layer === "answer_safe" || ["approved", "lawyer_reviewed", "answer_safe"].includes(state);
  });
  return {
    batch_id: manifest.batch_id,
    scope: manifest.scope,
    source_count: parseReport.source_count || (manifest.sources || []).length,
    paragraph_count: parseReport.paragraph_count || 0,
    proposition_count: parseReport.proposition_count || propositionCards.length,
    link_count: parseReport.link_count || (links.proposition_node_links || []).length,
    rejected_count: parseReport.rejected_count || 0,
    answer_safe_count: answerSafe.length,
    non_candidate_count: nonCandidate.length,
    illicit_non_candidate_count: illicitNonCandidate.length,
    source_policy: manifest.source_policy || {},
    scale_policy: manifest.scale_policy || {},
  };
}

function isRuntimeIsolationEnforced(env) {
  if (!isProductionScaleMode(env)) return true;
  return runtimeIsolationReport(env).ok;
}

function isVectorNamespaceSeparated(env) {
  if (!isProductionScaleMode(env)) return true;
  const propositions = resolveQdrantCollection("hk_proposition_cards", env, "QDRANT_COLLECTION_PROPOSITIONS");
  const paragraphs = resolveQdrantCollection("hk_legal_paragraphs", env, "QDRANT_COLLECTION_PARAGRAPHS");
  return propositions.includes("_prod")
    && paragraphs.includes("_prod")
    && !propositions.includes("_dev")
    && !paragraphs.includes("_dev");
}

const CORE_BATCH_GATES = [
  "current_batch_quote_rules_clean",
  "current_batch_candidate_only",
  "public_source_policy_enforced",
  "bulk_auto_attach_blocked",
];

const PRODUCTION_SCALE_GATES = [
  "production_embeddings_configured",
  "production_reranker_configured",
  "durable_orchestration_configured",
  "runtime_isolation_enforced",
  "vector_namespace_separated",
];

const POST_10K_DOMAIN_GATES = [
  "criminal_domain_retrieval_scope_enforced",
];

function requiredGatesForTarget(targetCases) {
  if (targetCases <= 50) {
    return { blocking: [...CORE_BATCH_GATES], optional: [] };
  }
  if (targetCases <= 10000) {
    return {
      blocking: [...CORE_BATCH_GATES, ...PRODUCTION_SCALE_GATES, "bail_gold_review_set_exists", ...POST_10K_DOMAIN_GATES],
      optional: [],
    };
  }
  return {
    blocking: [...CORE_BATCH_GATES, ...PRODUCTION_SCALE_GATES, "bail_gold_review_set_exists", ...POST_10K_DOMAIN_GATES],
    optional: [],
  };
}

function gate(id, ok, details = {}) {
  return {
    gate_id: id,
    ok: Boolean(ok),
    status: ok ? "passed" : "blocked",
    ...details,
  };
}

function selectRung(plan, targetCases) {
  return (plan.scale_ladder || []).find(rung => {
    const [min, max] = rung.case_range || [0, 0];
    return targetCases >= min && targetCases <= max;
  }) || null;
}

function evaluateScaleReadiness({
  targetCases = 20000,
  planPath = DEFAULT_PLAN_PATH,
  batchDir = DEFAULT_BATCH_DIR,
  env = loadEnv(),
} = {}) {
  const plan = readJson(planPath);
  const stats = artifactStats(batchDir);
  const selectedRung = selectRung(plan, targetCases);
  const gates = [
    gate("current_batch_quote_rules_clean", stats.rejected_count === 0, { rejected_count: stats.rejected_count }),
    gate("current_batch_candidate_only", stats.illicit_non_candidate_count === 0, {
      non_candidate_count: stats.non_candidate_count,
      illicit_non_candidate_count: stats.illicit_non_candidate_count,
      answer_safe_gold_count: stats.answer_safe_count,
    }),
    gate("public_source_policy_enforced", stats.source_policy.public_sources_only === true && stats.source_policy.private_or_licensed_sources_allowed === false, {
      source_policy: stats.source_policy,
    }),
    gate("bulk_auto_attach_blocked", stats.source_policy.bulk_auto_attach_allowed === false && stats.scale_policy.large_cross_domain_crawl_allowed === false, {
      bulk_auto_attach_allowed: stats.source_policy.bulk_auto_attach_allowed,
      large_cross_domain_crawl_allowed: stats.scale_policy.large_cross_domain_crawl_allowed,
    }),
    gate("production_embeddings_configured", isProductionEmbeddingReady(env), {
      provider: providerName(env, "LEGAL_EMBEDDING_PROVIDER", "EMBEDDING_PROVIDER", "local-hash"),
    }),
    gate("production_reranker_configured", isProductionRerankReady(env), {
      provider: providerName(env, "LEGAL_RERANK_PROVIDER", "RERANK_PROVIDER", "none"),
    }),
    gate("durable_orchestration_configured", isDurableOrchestrationReady(env), {
      inngest_event_key_present: Boolean(env.INNGEST_EVENT_KEY),
      inngest_signing_key_present: Boolean(env.INNGEST_SIGNING_KEY),
      inngest_dev_present: Boolean(env.INNGEST_DEV),
    }),
    gate("runtime_isolation_enforced", isRuntimeIsolationEnforced(env), runtimeIsolationReport(env)),
    gate("vector_namespace_separated", isVectorNamespaceSeparated(env), {
      runtime_mode: isProductionScaleMode(env) ? "production_scale" : "development",
      vector_namespace_suffix: vectorNamespaceSuffix(env),
      vector_space_id: embeddingVectorSpaceId(env),
      propositions_collection: resolveQdrantCollection("hk_proposition_cards", env, "QDRANT_COLLECTION_PROPOSITIONS"),
      paragraphs_collection: resolveQdrantCollection("hk_legal_paragraphs", env, "QDRANT_COLLECTION_PARAGRAPHS"),
    }),
    gate("bail_gold_review_set_exists", stats.answer_safe_count >= 3, {
      answer_safe_count: stats.answer_safe_count,
      required_answer_safe_count: 3,
    }),
    gate("criminal_domain_retrieval_scope_enforced", isCriminalDomainRetrievalScopeEnforced(env), retrievalScopePolicy(env)),
  ];
  const gatePolicy = requiredGatesForTarget(targetCases);
  const blockers = gates.filter(item => gatePolicy.blocking.includes(item.gate_id) && !item.ok).map(item => item.gate_id);
  const warnings = gates.filter(item => gatePolicy.optional.includes(item.gate_id) && !item.ok).map(item => item.gate_id);
  const targetRequiresProductionStack = targetCases > 50;
  const coreBlockers = blockers.filter(id => CORE_BATCH_GATES.includes(id));
  const allowedNow = Boolean(selectedRung && targetCases <= 50 && coreBlockers.length === 0);
  const status = blockers.length === 0
    ? "green_for_requested_target"
    : targetRequiresProductionStack
      ? targetCases <= 10000
        ? "blocked_until_production_stack_ready"
        : "blocked_for_large_scale"
      : allowedNow
        ? "allowed_for_bail_next_rung_with_warnings"
        : "blocked_until_core_gates_pass";
  return {
    readiness_id: "hk_criminal_case_scale_readiness_v2",
    generated_at: new Date().toISOString(),
    target_cases: targetCases,
    selected_rung: selectedRung,
    current_batch: stats,
    gate_results: gates,
    gate_policy: gatePolicy,
    blockers,
    warnings,
    status,
    execution_allowed: blockers.length === 0 || allowedNow,
    runtime_isolation: runtimeIsolationReport(env),
    next_safe_action: blockers.length === 0
      ? "Run the requested scale rung with sharded manifests, production vector namespaces and review queue enabled."
      : targetCases <= 10000
        ? "Clear production embeddings, reranker, orchestration, gold review and vector namespace gates before any 10k cross-domain write."
        : targetCases > 50
          ? "Do not run cross-section or 20000-case ingestion. Clear production embeddings, reranker, orchestration, gold review and eval gates first."
          : "Stay within bail-only scale; keep exact-quote rules and candidate-only outputs.",
    policy_note: targetCases <= 10000
      ? "10k cross-domain public-demo writes remain blocked until production embeddings, reranker, durable orchestration, vector namespace isolation and bail gold review are all green."
      : "This readiness report prepares large-scale ingestion but intentionally blocks unsafe 20000-case auto-fill until quality and operations gates are green.",
  };
}

module.exports = {
  CORE_BATCH_GATES,
  DEFAULT_BATCH_DIR,
  DEFAULT_PLAN_PATH,
  PRODUCTION_SCALE_GATES,
  artifactStats,
  evaluateScaleReadiness,
  isDurableOrchestrationReady,
  isProductionEmbeddingReady,
  isProductionRerankReady,
  isRuntimeIsolationEnforced,
  isVectorNamespaceSeparated,
  loadEnv,
  requiredGatesForTarget,
  selectRung,
};
