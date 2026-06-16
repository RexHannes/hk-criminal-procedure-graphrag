#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const MVP_PATH = path.join(ROOT, "data", "legal_ingest", "mvp", "hk_law_claude_mvp.json");
const DOC_PATH = path.join(ROOT, "docs", "hk-law-claude-mvp.md");
const MEMORY_MIGRATION = path.join(ROOT, "supabase", "migrations", "20260616000000_create_legal_answer_memory_tables.sql");
const CACHE_HELPER = path.join(ROOT, "legal-ingest-service", "cache", "retrieved_law_cache.py");
const PIPELINE_TABLES_MIGRATION = path.join(ROOT, "supabase", "migrations", "20260615000000_create_legal_rag_pipeline_tables.sql");

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

function loadEnv() {
  return {
    ...parseEnvFile(path.join(ROOT, ".env")),
    ...parseEnvFile(path.join(ROOT, ".env.local")),
    ...process.env,
  };
}

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

function fileIncludes(filePath, needles, errors) {
  assert(fs.existsSync(filePath), `missing file: ${path.relative(ROOT, filePath)}`, errors);
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  for (const needle of needles) {
    assert(text.includes(needle), `${path.relative(ROOT, filePath)} missing ${needle}`, errors);
  }
}

function validateMvpConfig(errors) {
  assert(fs.existsSync(MVP_PATH), "missing MVP config", errors);
  if (!fs.existsSync(MVP_PATH)) return null;
  const mvp = JSON.parse(fs.readFileSync(MVP_PATH, "utf8"));
  assert(mvp.mvp_id === "hk_law_claude_minimum_v1", "unexpected MVP id", errors);
  assert(Array.isArray(mvp.gates) && mvp.gates.length >= 7, "MVP must define at least 7 gates", errors);
  const gateIds = new Set((mvp.gates || []).map(g => g.gate_id));
  for (const gateId of [
    "corpus_input_and_licence_controls",
    "legal_processing_and_structured_objects",
    "embedding_and_vector_storage",
    "retrieval_and_reranking",
    "authority_treatment_and_answer_contract",
    "review_promotion_and_evals",
    "stored_retrieved_law_and_sop_cache",
  ]) {
    assert(gateIds.has(gateId), `MVP gate missing: ${gateId}`, errors);
  }
  assert(mvp.safe_book_form_upload_policy, "MVP safe book/form upload policy missing", errors);
  assert(mvp.scale_ladder, "MVP scale ladder missing", errors);
  return mvp;
}

function staticScaffoldReport(errors) {
  fileIncludes(DOC_PATH, [
    "Gate 1 - Corpus Input And Licence Controls",
    "Gate 7 - Stored Retrieved Law / SOP Cache",
    "Safe Upload Rule",
  ], errors);
  fileIncludes(PIPELINE_TABLES_MIGRATION, [
    "legal_ingest_runs",
    "legal_chunks",
    "vector_index_manifests",
    "retrieval_eval_cases",
  ], errors);
  fileIncludes(MEMORY_MIGRATION, [
    "retrieval_bundles",
    "legal_answer_snapshots",
    "sop_playbooks",
    "answer_safe_requires_approved",
  ], errors);
  fileIncludes(CACHE_HELPER, [
    "source_fingerprint",
    "can_reuse_cached_answer",
    "build_sop_playbook_record",
  ], errors);
}

function runtimeReadiness(env) {
  return {
    supabase: {
      configured: Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY),
      url_present: Boolean(env.SUPABASE_URL),
      service_role_present: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
    },
    qdrant: {
      configured: Boolean(env.QDRANT_URL),
      url_present: Boolean(env.QDRANT_URL),
    },
    embeddings: {
      configured: Boolean(env.OPENAI_API_KEY || env.EMBEDDING_API_KEY || env.DEEPSEEK_API_KEY),
      openai_present: Boolean(env.OPENAI_API_KEY),
      generic_embedding_key_present: Boolean(env.EMBEDDING_API_KEY),
      deepseek_present: Boolean(env.DEEPSEEK_API_KEY),
    },
    inngest: {
      configured: Boolean(env.INNGEST_EVENT_KEY || env.INNGEST_SIGNING_KEY),
      event_key_present: Boolean(env.INNGEST_EVENT_KEY),
      signing_key_present: Boolean(env.INNGEST_SIGNING_KEY),
    },
  };
}

function deriveGateReadiness(mvp, runtime) {
  const byId = Object.fromEntries(mvp.gates.map(g => [g.gate_id, g]));
  return [
    {
      gate_id: "corpus_input_and_licence_controls",
      status: runtime.supabase.configured ? byId.corpus_input_and_licence_controls.current_repo_status : "blocked_needs_supabase_env",
    },
    {
      gate_id: "legal_processing_and_structured_objects",
      status: byId.legal_processing_and_structured_objects.current_repo_status,
    },
    {
      gate_id: "embedding_and_vector_storage",
      status: runtime.qdrant.configured && runtime.embeddings.configured ? "config_present_needs_index_run" : "not_green_missing_qdrant_or_embedding_config",
    },
    {
      gate_id: "retrieval_and_reranking",
      status: byId.retrieval_and_reranking.current_repo_status,
    },
    {
      gate_id: "authority_treatment_and_answer_contract",
      status: byId.authority_treatment_and_answer_contract.current_repo_status,
    },
    {
      gate_id: "review_promotion_and_evals",
      status: byId.review_promotion_and_evals.current_repo_status,
    },
    {
      gate_id: "stored_retrieved_law_and_sop_cache",
      status: "scaffold_added_needs_api_wiring_and_remote_migration",
    },
    {
      gate_id: "private_source_access_controls",
      status: byId.private_source_access_controls?.current_repo_status || "not_defined",
    },
  ];
}

function main() {
  const strictProduction = process.argv.includes("--strict-production");
  const errors = [];
  const mvp = validateMvpConfig(errors);
  staticScaffoldReport(errors);
  const runtime = runtimeReadiness(loadEnv());
  const gate_readiness = mvp ? deriveGateReadiness(mvp, runtime) : [];
  const report = {
    mvp_id: mvp?.mvp_id || "missing",
    scaffold_valid: errors.length === 0,
    runtime,
    gate_readiness,
    production_green: gate_readiness.every(g => g.status === "green"),
    next_blockers: gate_readiness
      .filter(g => /not_green|blocked|partial|needs|pending|scaffold/.test(g.status))
      .map(g => `${g.gate_id}: ${g.status}`),
    errors,
  };
  console.log(JSON.stringify(report, null, 2));
  if (errors.length) process.exit(1);
  if (strictProduction && !report.production_green) process.exit(2);
}

main();
