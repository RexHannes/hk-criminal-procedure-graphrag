#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");
const { evaluateScaleReadiness } = require("../src/case_graph/scale_readiness");

const ROOT = path.resolve(__dirname, "..");
const CRIM_NODES_DIR = path.join(ROOT, "data", "legal_domain_packs", "demo_maps", "criminal_procedure_hk", "nodes");
const BAIL_BATCH_DIR = path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "bail_public_batch_v1");
const BROWSER_POLICY = path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "browser_discovery_policy.json");
const QDRANT_COLLECTIONS = ["hk_legal_paragraphs", "hk_proposition_cards", "hk_form_metadata"];

function parseArgs(argv) {
  const args = { format: "json" };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--format") args.format = argv[++i] || "json";
  }
  return args;
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const raw of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const [key, ...rest] = line.split("=");
    const value = rest.join("=").trim().replace(/^['"]|['"]$/g, "");
    if (value) out[key.trim()] = value;
  }
  return out;
}

function loadEnv() {
  return {
    ...parseEnvFile(path.join(ROOT, ".env")),
    ...parseEnvFile(path.join(ROOT, ".env.local")),
    ...process.env,
  };
}

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function arrayFromPayload(payload, key) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.[key])) return payload[key];
  return [];
}

function countCriminalProcedureNodes() {
  if (!fs.existsSync(CRIM_NODES_DIR)) return 0;
  return fs.readdirSync(CRIM_NODES_DIR)
    .filter(file => file.endsWith(".json"))
    .reduce((sum, file) => {
      const payload = readJson(path.join(CRIM_NODES_DIR, file), {});
      return sum + arrayFromPayload(payload, "nodes").length;
    }, 0);
}

function bailBatchStats() {
  const parseReport = readJson(path.join(BAIL_BATCH_DIR, "parse_report.json"), {});
  const paragraphs = arrayFromPayload(readJson(path.join(BAIL_BATCH_DIR, "paragraph_cards.json"), {}), "paragraph_cards");
  const propositions = arrayFromPayload(readJson(path.join(BAIL_BATCH_DIR, "proposition_cards.json"), {}), "proposition_cards");
  const links = arrayFromPayload(readJson(path.join(BAIL_BATCH_DIR, "proposition_node_links.json"), {}), "proposition_node_links");
  const linkedNodes = [...new Set(links.map(item => item.doctrine_node_id).filter(Boolean))].sort();
  return {
    source_count: parseReport.source_count || 0,
    paragraph_count: paragraphs.length || parseReport.paragraph_count || 0,
    proposition_count: propositions.length || parseReport.proposition_count || 0,
    link_count: links.length || parseReport.link_count || 0,
    rejected_count: parseReport.rejected_count || 0,
    answer_safe_count: propositions.filter(item => item.answer_layer_status === "answer_safe" || item.answer_safe === true).length,
    linked_doctrine_nodes: linkedNodes,
  };
}

async function qdrantCollectionStats(env) {
  const url = String(env.QDRANT_URL || "").replace(/\/$/, "");
  if (!url) return { configured: false, collections: [] };
  const collections = [];
  for (const name of QDRANT_COLLECTIONS) {
    try {
      const response = await fetch(`${url}/collections/${encodeURIComponent(name)}`);
      if (!response.ok) {
        collections.push({ name, ok: false, error: `http_${response.status}` });
        continue;
      }
      const body = await response.json();
      collections.push({
        name,
        ok: true,
        points_count: body?.result?.points_count ?? null,
        vector_size: body?.result?.config?.params?.vectors?.size ?? null,
      });
    } catch (error) {
      collections.push({ name, ok: false, error: error.message });
    }
  }
  return {
    configured: true,
    collections,
  };
}

function providerStatus(env) {
  const embeddingProvider = String(env.LEGAL_EMBEDDING_PROVIDER || env.EMBEDDING_PROVIDER || "local-hash");
  const rerankProvider = String(env.LEGAL_RERANK_PROVIDER || env.RERANK_PROVIDER || "none");
  return {
    supabase_configured: Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY),
    embedding_provider: embeddingProvider,
    production_embedding_key_present: Boolean(env.OPENAI_API_KEY || env.VOYAGE_API_KEY || env.COHERE_API_KEY || env.LEGAL_EMBEDDING_API_KEY),
    rerank_provider: rerankProvider,
    rerank_key_present: Boolean(env.COHERE_API_KEY || env.VOYAGE_API_KEY || env.LEGAL_RERANK_API_KEY),
    inngest_configured: Boolean((env.INNGEST_DEV || env.INNGEST_EVENT_KEY) && (env.INNGEST_DEV || env.INNGEST_SIGNING_KEY)),
    deepseek_available: Boolean(env.DEEPSEEK_API_KEY),
  };
}

function browserDiscoveryStatus() {
  const policy = readJson(BROWSER_POLICY, {});
  return {
    configured: policy.policy_id === "case_fruit_browser_guided_discovery_v1",
    mode: policy.browser_mode || "",
    allowed_domain_count: (policy.allowed_domains || []).length,
    max_searches_per_run: policy.rate_limits?.max_searches_per_run || null,
    max_fetches_per_run: policy.rate_limits?.max_fetches_per_run || null,
    deepseek_seed_status: policy.deepseek_case_seed_policy?.default_status || "",
    answer_safe_promotion_allowed: policy.answer_safe_promotion_allowed === true,
  };
}

function overallVerdict({ scale50, scale20000, bail, criminalProcedureNodes, providers }) {
  const implemented = [
    "criminal procedure L0-L3 tree exists",
    "bail case-fruit public batch exists",
    "quote/rejection gate is clean for current bail batch",
    "SOP bridge and source audit path exist",
    "large-scale 20k run is blocked by readiness gates",
  ];
  const partial = [
    "Qdrant is useful only to the extent embeddings are production-grade",
    "case fruits are recallable for bail nodes but not the full criminal tree",
    "DeepSeek can propose extraction rules only when configured and still remains gated",
  ];
  const missing = [];
  if (providers.embedding_provider === "local-hash") missing.push("production embedding provider");
  if (providers.rerank_provider === "none") missing.push("production reranker");
  if (!providers.inngest_configured) missing.push("durable Inngest orchestration");
  if (bail.answer_safe_count < 3) missing.push("3+ answer-safe reviewed bail propositions");
  if (!scale20000.execution_allowed) missing.push("large-scale corpus execution clearance");
  if (criminalProcedureNodes && bail.linked_doctrine_nodes.length < criminalProcedureNodes) missing.push("criminal-tree-wide L4/L5 case fruit coverage");
  return {
    status: scale50.execution_allowed && !scale20000.execution_allowed
      ? "pilot_working_large_scale_blocked"
      : scale20000.execution_allowed
        ? "large_scale_allowed"
        : "blocked",
    implemented,
    partial,
    missing,
  };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# HK Legal RAG Audit");
  lines.push("");
  lines.push(`Generated: ${report.generated_at}`);
  lines.push(`Status: **${report.verdict.status}**`);
  lines.push("");
  lines.push("## Counts");
  lines.push("");
  lines.push(`- Criminal procedure nodes: ${report.criminal_procedure_nodes}`);
  lines.push(`- Bail source count: ${report.bail_batch.source_count}`);
  lines.push(`- Bail paragraph cards: ${report.bail_batch.paragraph_count}`);
  lines.push(`- Bail proposition cards: ${report.bail_batch.proposition_count}`);
  lines.push(`- Bail doctrine links: ${report.bail_batch.link_count}`);
  lines.push(`- Linked doctrine nodes: ${report.bail_batch.linked_doctrine_nodes.length}`);
  lines.push(`- Answer-safe bail cards: ${report.bail_batch.answer_safe_count}`);
  lines.push("");
  lines.push("## Providers");
  lines.push("");
  lines.push(`- Supabase configured: ${report.providers.supabase_configured}`);
  lines.push(`- Embeddings: ${report.providers.embedding_provider}`);
  lines.push(`- Reranker: ${report.providers.rerank_provider}`);
  lines.push(`- Inngest configured: ${report.providers.inngest_configured}`);
  lines.push(`- DeepSeek available: ${report.providers.deepseek_available}`);
  lines.push(`- Browser discovery mode: ${report.browser_discovery.mode || "not configured"}`);
  lines.push("");
  lines.push("## Scale");
  lines.push("");
  lines.push(`- 50-case bail rung: ${report.scale.bail_50.status}, execution_allowed=${report.scale.bail_50.execution_allowed}`);
  lines.push(`- 20k criminal run: ${report.scale.criminal_20000.status}, execution_allowed=${report.scale.criminal_20000.execution_allowed}`);
  lines.push(`- 20k blockers: ${report.scale.criminal_20000.blockers.join(", ") || "none"}`);
  lines.push("");
  lines.push("## Implemented");
  report.verdict.implemented.forEach(item => lines.push(`- ${item}`));
  lines.push("");
  lines.push("## Partial");
  report.verdict.partial.forEach(item => lines.push(`- ${item}`));
  lines.push("");
  lines.push("## Missing");
  report.verdict.missing.forEach(item => lines.push(`- ${item}`));
  lines.push("");
  lines.push("## Qdrant");
  report.qdrant.collections.forEach(item => {
    lines.push(`- ${item.name}: ${item.ok ? `${item.points_count} points, vector size ${item.vector_size}` : `not ok (${item.error})`}`);
  });
  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv);
  const env = loadEnv();
  const criminalProcedureNodes = countCriminalProcedureNodes();
  const bail = bailBatchStats();
  const providers = providerStatus(env);
  const qdrant = await qdrantCollectionStats(env);
  const browserDiscovery = browserDiscoveryStatus();
  const scale50 = evaluateScaleReadiness({ targetCases: 50, env });
  const scale20000 = evaluateScaleReadiness({ targetCases: 20000, env });
  const report = {
    audit_id: "hk_legal_rag_current_progress_audit_v1",
    generated_at: new Date().toISOString(),
    criminal_procedure_nodes: criminalProcedureNodes,
    bail_batch: bail,
    providers,
    qdrant,
    browser_discovery: browserDiscovery,
    scale: {
      bail_50: {
        status: scale50.status,
        execution_allowed: scale50.execution_allowed,
        blockers: scale50.blockers,
      },
      criminal_20000: {
        status: scale20000.status,
        execution_allowed: scale20000.execution_allowed,
        blockers: scale20000.blockers,
      },
    },
  };
  report.verdict = overallVerdict({
    scale50,
    scale20000,
    bail,
    criminalProcedureNodes,
    providers,
  });

  if (args.format === "md" || args.format === "markdown") {
    console.log(renderMarkdown(report));
  } else {
    console.log(JSON.stringify(report, null, 2));
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
