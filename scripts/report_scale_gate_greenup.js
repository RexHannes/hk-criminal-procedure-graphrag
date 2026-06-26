#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");
const { evaluateScaleReadiness, loadEnv } = require("../src/case_graph/scale_readiness");

const ROOT = path.resolve(__dirname, "..");
const ENV_LOCAL = path.join(ROOT, ".env.local");
const REVIEW_PACKET = path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "bail_public_batch_v1", "answer_safe_review_packet.json");
const OPENROUTER_FREE_CHAT_MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free";
const OPENROUTER_FREE_EMBEDDING_MODEL = "nvidia/llama-nemotron-embed-vl-1b-v2:free";
const OPENROUTER_FREE_RERANK_MODEL = "nvidia/llama-nemotron-rerank-vl-1b-v2:free";
const OPENROUTER_FREE_EMBEDDING_DIM = "2048";

function parseArgs(argv) {
  const args = { targetCases: 10000, writeLocalDevEnv: false };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--target-cases") args.targetCases = Number(argv[++i] || args.targetCases);
    else if (argv[i] === "--write-local-dev-env") args.writeLocalDevEnv = true;
  }
  return args;
}

function parseEnvText(text) {
  const entries = new Map();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const [key, ...rest] = line.split("=");
    entries.set(key.trim(), rest.join("=").trim());
  }
  return entries;
}

function writeLocalDevEnv() {
  const existing = fs.existsSync(ENV_LOCAL) ? fs.readFileSync(ENV_LOCAL, "utf8") : "";
  const entries = parseEnvText(existing);
  const safeDefaults = {
    INNGEST_DEV: "1",
    OPENROUTER_FREE_ONLY: "true",
    OPENROUTER_ALLOW_PAID: "false",
  };
  if (process.env.OPENROUTER_API_KEY || entries.has("OPENROUTER_API_KEY")) {
    safeDefaults.OPENROUTER_MODEL = OPENROUTER_FREE_CHAT_MODEL;
    safeDefaults.LEGAL_EMBEDDING_PROVIDER = "openrouter";
    safeDefaults.LEGAL_EMBEDDING_MODEL = OPENROUTER_FREE_EMBEDDING_MODEL;
    safeDefaults.LEGAL_EMBEDDING_DIM = OPENROUTER_FREE_EMBEDDING_DIM;
    safeDefaults.LEGAL_RERANK_PROVIDER = "openrouter";
    safeDefaults.LEGAL_RERANK_MODEL = OPENROUTER_FREE_RERANK_MODEL;
  }
  for (const [key, value] of Object.entries(safeDefaults)) {
    if (!entries.has(key)) entries.set(key, value);
  }
  const preservedComments = existing
    .split(/\r?\n/)
    .filter(line => line.trim().startsWith("#"))
    .join("\n");
  const body = Array.from(entries.entries())
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  fs.writeFileSync(ENV_LOCAL, `${preservedComments ? `${preservedComments}\n` : ""}${body}\n`);
}

function providerSuggestions(env, { targetCases = 0 } = {}) {
  const suggestions = [];
  if (!env.VOYAGE_API_KEY && !env.COHERE_API_KEY && !env.OPENAI_API_KEY && !env.LEGAL_EMBEDDING_API_KEY && !env.OPENROUTER_API_KEY) {
    suggestions.push({
      gate_id: "production_embeddings_configured",
      action: "Set a real embedding provider and matching key.",
      examples: [
        "LEGAL_EMBEDDING_PROVIDER=voyage + VOYAGE_API_KEY + LEGAL_EMBEDDING_MODEL=voyage-3-large",
        "LEGAL_EMBEDDING_PROVIDER=cohere + COHERE_API_KEY + LEGAL_EMBEDDING_MODEL=embed-v4.0",
        "LEGAL_EMBEDDING_PROVIDER=openai + OPENAI_API_KEY + LEGAL_EMBEDDING_MODEL=text-embedding-3-small",
        `LEGAL_EMBEDDING_PROVIDER=openrouter + OPENROUTER_API_KEY + LEGAL_EMBEDDING_MODEL=${OPENROUTER_FREE_EMBEDDING_MODEL} + LEGAL_EMBEDDING_DIM=${OPENROUTER_FREE_EMBEDDING_DIM}`,
      ],
      note: "OpenRouter can clear this gate only with an embedding model id ending in :free, unless OPENROUTER_ALLOW_PAID=true is explicit.",
    });
  }
  if (!env.COHERE_API_KEY && !env.VOYAGE_API_KEY && !env.LEGAL_RERANK_API_KEY && !env.OPENROUTER_API_KEY) {
    suggestions.push({
      gate_id: "production_reranker_configured",
      action: "Set a real reranker provider and matching key.",
      examples: [
        "LEGAL_RERANK_PROVIDER=cohere + COHERE_API_KEY + LEGAL_RERANK_MODEL=rerank-v3.5",
        "LEGAL_RERANK_PROVIDER=voyage + VOYAGE_API_KEY + LEGAL_RERANK_MODEL=rerank-2",
        `LEGAL_RERANK_PROVIDER=openrouter + OPENROUTER_API_KEY + LEGAL_RERANK_MODEL=${OPENROUTER_FREE_RERANK_MODEL}`,
      ],
      note: "OpenRouter can clear this gate only with a rerank model id ending in :free, unless OPENROUTER_ALLOW_PAID=true is explicit.",
    });
  }
  if (env.OPENROUTER_API_KEY && String(env.OPENROUTER_FREE_ONLY || "true").toLowerCase() !== "false" && String(env.OPENROUTER_ALLOW_PAID || "").toLowerCase() !== "true") {
    suggestions.push({
      gate_id: "production_embeddings_configured",
      action: "If using OpenRouter for embeddings under free-only mode, set LEGAL_EMBEDDING_MODEL to a free model id ending in :free.",
    });
    suggestions.push({
      gate_id: "production_reranker_configured",
      action: "If using OpenRouter for rerank under free-only mode, set LEGAL_RERANK_MODEL to a free model id ending in :free.",
    });
  }
  if ((targetCases > 1000 && !(env.INNGEST_EVENT_KEY && env.INNGEST_SIGNING_KEY)) || (!env.INNGEST_DEV && !(env.INNGEST_EVENT_KEY && env.INNGEST_SIGNING_KEY))) {
    suggestions.push({
      gate_id: "durable_orchestration_configured",
      action: targetCases > 1000
        ? "For 10k-scale execution, set production INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY; local INNGEST_DEV is only accepted for smaller dev rungs."
        : "For local dev, run this script with --write-local-dev-env. For production, set INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY.",
    });
  }
  suggestions.push({
    gate_id: "bail_gold_review_set_exists",
    action: "Human/legal reviewer must approve at least 3 CFA bail propositions from the review packet.",
    review_packet: path.relative(ROOT, REVIEW_PACKET),
    note: "Codex must not auto-promote machine_candidate propositions to answer_safe.",
  });
  return suggestions;
}

const args = parseArgs(process.argv);
if (args.writeLocalDevEnv) writeLocalDevEnv();
const env = loadEnv({ root: ROOT });
const report = evaluateScaleReadiness({ targetCases: args.targetCases, env });
const output = {
  report_id: "scale_gate_greenup_doctor_v1",
  generated_at: new Date().toISOString(),
  target_cases: args.targetCases,
  wrote_local_dev_env: args.writeLocalDevEnv,
  readiness_status: report.status,
  execution_allowed: report.execution_allowed,
  blockers: report.blockers,
  gate_results: report.gate_results.map(item => ({
    gate_id: item.gate_id,
    ok: item.ok,
    status: item.status,
    provider: item.provider,
    model: item.model,
    openrouter_free_only: item.openrouter_free_only,
    openrouter_paid_allowed: item.openrouter_paid_allowed,
    answer_safe_count: item.answer_safe_count,
    required_answer_safe_count: item.required_answer_safe_count,
    inngest_dev_present: item.inngest_dev_present,
    inngest_event_key_present: item.inngest_event_key_present,
    inngest_signing_key_present: item.inngest_signing_key_present,
    production_orchestration_required: item.production_orchestration_required,
  })),
  next_actions: providerSuggestions(env, { targetCases: args.targetCases }).filter(item => report.blockers.includes(item.gate_id)),
  safety_note: "This script may enable local Inngest dev, but it never fakes embeddings, reranker, or legal review.",
};

console.log(JSON.stringify(output, null, 2));
