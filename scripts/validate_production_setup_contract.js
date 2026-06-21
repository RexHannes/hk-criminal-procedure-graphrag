#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");
const {
  artifactStats,
  isDurableOrchestrationReady,
  isProductionEmbeddingReady,
  isProductionRerankReady,
  loadEnv,
} = require("../src/case_graph/scale_readiness");

const ROOT = path.resolve(__dirname, "..");
const CONTRACT_PATH = path.join(ROOT, "data", "legal_ingest", "mvp", "production_provider_setup.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function clean(value) {
  return String(value || "").trim().replace(/^['"]|['"]$/g, "");
}

function present(env, key) {
  return Boolean(clean(env[key]));
}

function valueOf(env, key) {
  return clean(env[key]);
}

function provider(env, primary, fallback, defaultValue) {
  return String(valueOf(env, primary) || valueOf(env, fallback) || defaultValue || "").toLowerCase();
}

function providerKeyPresent(env, kind, providerName) {
  const keys = {
    embedding: {
      openai: ["OPENAI_API_KEY"],
      voyage: ["VOYAGE_API_KEY"],
      cohere: ["COHERE_API_KEY"],
    },
    rerank: {
      cohere: ["COHERE_API_KEY"],
      voyage: ["VOYAGE_API_KEY"],
    },
  };
  return (keys[kind]?.[providerName] || []).some(key => present(env, key));
}

function envFlags(env) {
  const embeddingProvider = provider(env, "LEGAL_EMBEDDING_PROVIDER", "EMBEDDING_PROVIDER", "local-hash");
  const rerankProvider = provider(env, "LEGAL_RERANK_PROVIDER", "RERANK_PROVIDER", "none");
  let stats = {};
  try {
    stats = artifactStats();
  } catch (error) {
    stats = { error: error.message, answer_safe_count: 0 };
  }
  return {
    supabase_configured: present(env, "SUPABASE_URL") && present(env, "SUPABASE_SERVICE_ROLE_KEY"),
    legal_review_admin_token_present: present(env, "LEGAL_REVIEW_ADMIN_TOKEN"),
    qdrant_configured: present(env, "QDRANT_URL"),
    qdrant_api_key_present: present(env, "QDRANT_API_KEY"),
    embedding_provider: embeddingProvider,
    embedding_provider_is_dev_only: ["", "none", "local", "local-hash"].includes(embeddingProvider),
    production_embeddings_configured: isProductionEmbeddingReady(env),
    embedding_model_present: present(env, "LEGAL_EMBEDDING_MODEL") || present(env, "EMBEDDING_MODEL"),
    embedding_dim_present: present(env, "LEGAL_EMBEDDING_DIM"),
    embedding_provider_key_present: providerKeyPresent(env, "embedding", embeddingProvider),
    rerank_provider: rerankProvider,
    rerank_provider_is_disabled: ["", "none", "local"].includes(rerankProvider),
    production_reranker_configured: isProductionRerankReady(env),
    rerank_model_present: present(env, "LEGAL_RERANK_MODEL") || present(env, "RERANK_MODEL"),
    rerank_provider_key_present: providerKeyPresent(env, "rerank", rerankProvider),
    deepseek_key_present: present(env, "DEEPSEEK_API_KEY"),
    durable_orchestration_configured: isDurableOrchestrationReady(env),
    inngest_dev_present: present(env, "INNGEST_DEV"),
    inngest_event_key_present: present(env, "INNGEST_EVENT_KEY"),
    inngest_signing_key_present: present(env, "INNGEST_SIGNING_KEY"),
    storage_backend: valueOf(env, "LEGAL_STORAGE_BACKEND") || "local",
    private_ingestion_enabled: valueOf(env, "PRIVATE_SOURCE_INGESTION_ENABLED") === "true",
    clerk_enabled: valueOf(env, "CLERK_ENABLED") === "true",
    clerk_secret_present: present(env, "CLERK_SECRET_KEY"),
    clerk_jwt_key_present: present(env, "CLERK_JWT_KEY"),
    answer_safe_count: stats.answer_safe_count || 0,
    artifact_stats: stats,
  };
}

function stage(id, ok, blockers, warnings = [], details = {}) {
  return {
    stage_id: id,
    status: ok ? "ready" : "blocked_or_partial",
    ok: Boolean(ok),
    blockers,
    warnings,
    ...details,
  };
}

function evaluate(flags) {
  const stages = [];
  stages.push(stage(
    "local_dev_smoke",
    flags.supabase_configured && flags.legal_review_admin_token_present && flags.qdrant_configured && ["local-hash", "local"].includes(flags.embedding_provider),
    [
      !flags.supabase_configured && "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
      !flags.legal_review_admin_token_present && "LEGAL_REVIEW_ADMIN_TOKEN",
      !flags.qdrant_configured && "QDRANT_URL",
      !["local-hash", "local"].includes(flags.embedding_provider) && "LEGAL_EMBEDDING_PROVIDER=local-hash for dev smoke",
    ].filter(Boolean),
    flags.private_ingestion_enabled ? ["Private ingestion is enabled; keep it disabled for local public smoke tests."] : []
  ));
  stages.push(stage(
    "bail_next_rung_20_50",
    flags.supabase_configured && flags.legal_review_admin_token_present && flags.qdrant_configured,
    [
      !flags.supabase_configured && "Supabase URL/service-role key",
      !flags.legal_review_admin_token_present && "LEGAL_REVIEW_ADMIN_TOKEN",
      !flags.qdrant_configured && "QDRANT_URL",
    ].filter(Boolean),
    [
      flags.embedding_provider_is_dev_only && "Allowed with warnings for bail-only rule batches; not production semantic retrieval.",
      !flags.deepseek_key_present && "DEEPSEEK_API_KEY is optional; without it, proposals must be authored manually.",
    ].filter(Boolean)
  ));
  stages.push(stage(
    "production_retrieval",
    flags.qdrant_configured
      && flags.production_embeddings_configured
      && flags.embedding_model_present
      && flags.embedding_dim_present
      && flags.production_reranker_configured
      && flags.rerank_model_present,
    [
      !flags.qdrant_configured && "QDRANT_URL",
      !flags.production_embeddings_configured && "Real LEGAL_EMBEDDING_PROVIDER plus matching provider key",
      !flags.embedding_model_present && "LEGAL_EMBEDDING_MODEL",
      !flags.embedding_dim_present && "LEGAL_EMBEDDING_DIM",
      !flags.production_reranker_configured && "Real LEGAL_RERANK_PROVIDER plus matching provider key",
      !flags.rerank_model_present && "LEGAL_RERANK_MODEL",
    ].filter(Boolean),
    [
      flags.embedding_provider_is_dev_only && "local-hash must be replaced before semantic retrieval scale.",
      flags.rerank_provider_is_disabled && "Rerank is pass-through until Cohere/Voyage rerank is configured.",
    ].filter(Boolean),
    {
      embedding_provider: flags.embedding_provider,
      rerank_provider: flags.rerank_provider,
    }
  ));
  stages.push(stage(
    "durable_ingestion",
    flags.durable_orchestration_configured,
    [
      !flags.durable_orchestration_configured && "INNGEST_DEV for local or INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY for hosted",
    ].filter(Boolean)
  ));
  stages.push(stage(
    "gold_review_gate",
    flags.answer_safe_count >= 3,
    [
      flags.answer_safe_count < 3 && `Promote at least 3 reviewed bail propositions; current answer_safe_count=${flags.answer_safe_count}`,
    ].filter(Boolean),
    ["Promotion must remain human/legal review only; no bulk script promotion."],
    { answer_safe_count: flags.answer_safe_count }
  ));
  stages.push(stage(
    "private_source_ingestion",
    flags.storage_backend === "supabase"
      && flags.clerk_enabled
      && flags.clerk_secret_present
      && flags.clerk_jwt_key_present
      && flags.production_embeddings_configured,
    [
      flags.storage_backend !== "supabase" && "LEGAL_STORAGE_BACKEND=supabase",
      !flags.clerk_enabled && "CLERK_ENABLED=true",
      !flags.clerk_secret_present && "CLERK_SECRET_KEY",
      !flags.clerk_jwt_key_present && "CLERK_JWT_KEY",
      !flags.production_embeddings_configured && "Production embedding provider for private namespace indexing",
    ].filter(Boolean),
    [
      flags.private_ingestion_enabled
        ? "Private ingestion flag is on; verify tenant filters and storage policies before uploading licensed material."
        : "Keep PRIVATE_SOURCE_INGESTION_ENABLED=false until this stage is green.",
    ]
  ));
  stages.push(stage(
    "large_scale_20k_preflight",
    flags.production_embeddings_configured
      && flags.production_reranker_configured
      && flags.durable_orchestration_configured
      && flags.answer_safe_count >= 3,
    [
      !flags.production_embeddings_configured && "production_embeddings_configured",
      !flags.production_reranker_configured && "production_reranker_configured",
      !flags.durable_orchestration_configured && "durable_orchestration_configured",
      flags.answer_safe_count < 3 && "bail_gold_review_set_exists",
    ].filter(Boolean),
    ["Even when green, scale section-by-section; do not bulk auto-attach across the whole criminal tree."]
  ));
  return stages;
}

function main() {
  const contract = readJson(CONTRACT_PATH);
  const env = loadEnv({ root: ROOT });
  const flags = envFlags(env);
  const stages = evaluate(flags);
  const firstBlocked = stages.find(item => !item.ok);
  const report = {
    setup_id: contract.setup_id,
    generated_at: new Date().toISOString(),
    current_safe_action: firstBlocked?.stage_id === "local_dev_smoke"
      ? "Finish local smoke prerequisites."
      : stages.find(item => item.stage_id === "production_retrieval" && !item.ok)
        ? "Continue bail-only/public-source pilots; configure real embeddings/reranker before semantic scale."
        : stages.find(item => item.stage_id === "gold_review_gate" && !item.ok)
          ? "Review and promote 3-5 bail propositions before larger scale."
          : "Proceed only with the next explicitly green rung.",
    flags,
    stages,
    missing_by_stage: Object.fromEntries(stages.map(item => [item.stage_id, item.blockers])),
    secret_policy: "Secrets are reported as present/absent only. Do not commit .env.local or service-role/API keys.",
  };
  console.log(JSON.stringify(report, null, 2));
  if (process.argv.includes("--strict") && stages.some(item => !item.ok)) process.exit(2);
}

if (require.main === module) {
  main();
}

module.exports = { envFlags, evaluate };
