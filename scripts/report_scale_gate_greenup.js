#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");
const { evaluateScaleReadiness, loadEnv } = require("../src/case_graph/scale_readiness");

const ROOT = path.resolve(__dirname, "..");
const ENV_LOCAL = path.join(ROOT, ".env.local");
const REVIEW_PACKET = path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "bail_public_batch_v1", "answer_safe_review_packet.json");

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

function providerSuggestions(env) {
  const suggestions = [];
  if (!env.VOYAGE_API_KEY && !env.COHERE_API_KEY && !env.OPENAI_API_KEY && !env.LEGAL_EMBEDDING_API_KEY) {
    suggestions.push({
      gate_id: "production_embeddings_configured",
      action: "Set a real embedding provider and matching key.",
      examples: [
        "LEGAL_EMBEDDING_PROVIDER=voyage + VOYAGE_API_KEY + LEGAL_EMBEDDING_MODEL=voyage-3-large",
        "LEGAL_EMBEDDING_PROVIDER=cohere + COHERE_API_KEY + LEGAL_EMBEDDING_MODEL=embed-v4.0",
        "LEGAL_EMBEDDING_PROVIDER=openai + OPENAI_API_KEY + LEGAL_EMBEDDING_MODEL=text-embedding-3-small",
      ],
      note: "OpenRouter chat keys do not clear the embedding gate.",
    });
  }
  if (!env.COHERE_API_KEY && !env.VOYAGE_API_KEY && !env.LEGAL_RERANK_API_KEY) {
    suggestions.push({
      gate_id: "production_reranker_configured",
      action: "Set a real reranker provider and matching key.",
      examples: [
        "LEGAL_RERANK_PROVIDER=cohere + COHERE_API_KEY + LEGAL_RERANK_MODEL=rerank-v3.5",
        "LEGAL_RERANK_PROVIDER=voyage + VOYAGE_API_KEY + LEGAL_RERANK_MODEL=rerank-2",
      ],
      note: "DeepSeek/OpenRouter chat models do not clear the reranker gate.",
    });
  }
  if (!env.INNGEST_DEV && !(env.INNGEST_EVENT_KEY && env.INNGEST_SIGNING_KEY)) {
    suggestions.push({
      gate_id: "durable_orchestration_configured",
      action: "For local dev, run this script with --write-local-dev-env. For production, set INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY.",
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
    answer_safe_count: item.answer_safe_count,
    required_answer_safe_count: item.required_answer_safe_count,
    inngest_dev_present: item.inngest_dev_present,
    inngest_event_key_present: item.inngest_event_key_present,
    inngest_signing_key_present: item.inngest_signing_key_present,
  })),
  next_actions: providerSuggestions(env).filter(item => report.blockers.includes(item.gate_id)),
  safety_note: "This script may enable local Inngest dev, but it never fakes embeddings, reranker, or legal review.",
};

console.log(JSON.stringify(output, null, 2));
