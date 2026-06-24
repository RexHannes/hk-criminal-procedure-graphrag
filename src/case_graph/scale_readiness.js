const fs = require("fs");
const path = require("path");

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

function cleanEnvValue(env, key) {
  return String(env[key] || "").trim().replace(/^['"]|['"]$/g, "");
}

function openRouterFreeOnlyAllowsModel(env, model) {
  const freeOnly = String(env.OPENROUTER_FREE_ONLY || "true").toLowerCase() !== "false";
  const paidAllowed = String(env.OPENROUTER_ALLOW_PAID || "").toLowerCase() === "true";
  if (!freeOnly || paidAllowed) return true;
  return /:free$/i.test(String(model || "").trim());
}

function isProductionEmbeddingReady(env) {
  const provider = providerName(env, "LEGAL_EMBEDDING_PROVIDER", "EMBEDDING_PROVIDER", "local-hash");
  if (["", "none", "local", "local-hash"].includes(provider)) return false;
  const requiredKeys = {
    openai: ["OPENAI_API_KEY"],
    voyage: ["VOYAGE_API_KEY"],
    cohere: ["COHERE_API_KEY"],
    openrouter: ["OPENROUTER_API_KEY"],
  };
  if (!hasAny(env, requiredKeys[provider] || ["LEGAL_EMBEDDING_API_KEY", "OPENAI_API_KEY", "VOYAGE_API_KEY", "COHERE_API_KEY", "OPENROUTER_API_KEY"])) {
    return false;
  }
  if (provider === "openrouter") {
    const model = cleanEnvValue(env, "LEGAL_EMBEDDING_MODEL") || cleanEnvValue(env, "OPENROUTER_EMBEDDING_MODEL");
    return Boolean(model) && openRouterFreeOnlyAllowsModel(env, model);
  }
  return true;
}

function isProductionRerankReady(env) {
  const provider = providerName(env, "LEGAL_RERANK_PROVIDER", "RERANK_PROVIDER", "none");
  if (["", "none", "local"].includes(provider)) return false;
  const requiredKeys = {
    cohere: ["COHERE_API_KEY"],
    voyage: ["VOYAGE_API_KEY"],
    openrouter: ["OPENROUTER_API_KEY"],
  };
  if (!hasAny(env, requiredKeys[provider] || ["LEGAL_RERANK_API_KEY", "COHERE_API_KEY", "VOYAGE_API_KEY", "OPENROUTER_API_KEY"])) {
    return false;
  }
  if (provider === "openrouter") {
    const model = cleanEnvValue(env, "LEGAL_RERANK_MODEL") || cleanEnvValue(env, "OPENROUTER_RERANK_MODEL");
    return Boolean(model) && openRouterFreeOnlyAllowsModel(env, model);
  }
  return true;
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
    const state = card.review_state || card.review_status || "";
    const layer = card.answer_layer_status || "";
    const approvedGold = card.answer_safe === true || layer === "answer_safe" || ["approved", "lawyer_reviewed", "answer_safe"].includes(state);
    if (approvedGold) return false;
    const allowedCandidateStates = new Set(["", "machine_candidate", "candidate_only", "quote_verified", "source_verified", "research_only", "lawyer_review_required"]);
    return !allowedCandidateStates.has(state) || !allowedCandidateStates.has(layer);
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
    non_candidate_count: illicitNonCandidate.length,
    source_policy: manifest.source_policy || {},
    scale_policy: manifest.scale_policy || {},
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
    gate("current_batch_candidate_only", stats.non_candidate_count === 0, { non_candidate_count: stats.non_candidate_count }),
    gate("public_source_policy_enforced", stats.source_policy.public_sources_only === true && stats.source_policy.private_or_licensed_sources_allowed === false, {
      source_policy: stats.source_policy,
    }),
    gate("bulk_auto_attach_blocked", stats.source_policy.bulk_auto_attach_allowed === false && stats.scale_policy.large_cross_domain_crawl_allowed === false, {
      bulk_auto_attach_allowed: stats.source_policy.bulk_auto_attach_allowed,
      large_cross_domain_crawl_allowed: stats.scale_policy.large_cross_domain_crawl_allowed,
    }),
    gate("production_embeddings_configured", isProductionEmbeddingReady(env), {
      provider: providerName(env, "LEGAL_EMBEDDING_PROVIDER", "EMBEDDING_PROVIDER", "local-hash"),
      model: cleanEnvValue(env, "LEGAL_EMBEDDING_MODEL") || cleanEnvValue(env, "OPENROUTER_EMBEDDING_MODEL") || cleanEnvValue(env, "EMBEDDING_MODEL"),
      openrouter_free_only: String(env.OPENROUTER_FREE_ONLY || "true").toLowerCase() !== "false",
      openrouter_paid_allowed: String(env.OPENROUTER_ALLOW_PAID || "").toLowerCase() === "true",
    }),
    gate("production_reranker_configured", isProductionRerankReady(env), {
      provider: providerName(env, "LEGAL_RERANK_PROVIDER", "RERANK_PROVIDER", "none"),
      model: cleanEnvValue(env, "LEGAL_RERANK_MODEL") || cleanEnvValue(env, "OPENROUTER_RERANK_MODEL") || cleanEnvValue(env, "RERANK_MODEL"),
      openrouter_free_only: String(env.OPENROUTER_FREE_ONLY || "true").toLowerCase() !== "false",
      openrouter_paid_allowed: String(env.OPENROUTER_ALLOW_PAID || "").toLowerCase() === "true",
    }),
    gate("durable_orchestration_configured", isDurableOrchestrationReady(env), {
      inngest_event_key_present: Boolean(env.INNGEST_EVENT_KEY),
      inngest_signing_key_present: Boolean(env.INNGEST_SIGNING_KEY),
      inngest_dev_present: Boolean(env.INNGEST_DEV),
    }),
    gate("bail_gold_review_set_exists", stats.answer_safe_count >= 3, {
      answer_safe_count: stats.answer_safe_count,
      required_answer_safe_count: 3,
    }),
  ];
  const blockers = gates.filter(item => !item.ok).map(item => item.gate_id);
  const targetRequiresAllGreen = targetCases > 50;
  const allowedNow = selectedRung
    && targetCases <= 50
    && blockers.every(id => !["current_batch_quote_rules_clean", "current_batch_candidate_only", "public_source_policy_enforced", "bulk_auto_attach_blocked"].includes(id));
  return {
    readiness_id: "hk_criminal_case_scale_readiness_v1",
    generated_at: new Date().toISOString(),
    target_cases: targetCases,
    selected_rung: selectedRung,
    current_batch: stats,
    gate_results: gates,
    blockers,
    status: blockers.length === 0
      ? "green_for_requested_target"
      : targetRequiresAllGreen
        ? "blocked_for_large_scale"
        : allowedNow
          ? "allowed_for_bail_next_rung_with_warnings"
          : "blocked_until_core_gates_pass",
    execution_allowed: blockers.length === 0 || allowedNow,
    next_safe_action: blockers.length === 0
      ? "Run the requested scale rung with sharded manifests and review queue enabled."
      : targetCases > 50
        ? "Do not run cross-section or 20000-case ingestion. Clear production embeddings, reranker, orchestration, gold review and eval gates first."
        : "Stay within bail-only scale; keep exact-quote rules and candidate-only outputs.",
    policy_note: "This readiness report prepares large-scale ingestion but intentionally blocks unsafe 20000-case auto-fill until quality and operations gates are green.",
  };
}

module.exports = {
  DEFAULT_BATCH_DIR,
  DEFAULT_PLAN_PATH,
  artifactStats,
  evaluateScaleReadiness,
  isDurableOrchestrationReady,
  isProductionEmbeddingReady,
  isProductionRerankReady,
  loadEnv,
  selectRung,
};
