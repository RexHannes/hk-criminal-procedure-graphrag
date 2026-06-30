#!/usr/bin/env node
/* eslint-disable no-console */

const path = require("path");
const { evaluateScaleReadiness } = require("../src/case_graph/scale_readiness");

const ROOT = path.resolve(__dirname, "..");

function parseEnvFile(filePath) {
  const fs = require("fs");
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

function secretPresent(env, key) {
  return Boolean(env[key] && String(env[key]).trim());
}

function main() {
  const fileOnlyEnv = {
    ...parseEnvFile(path.join(ROOT, ".env")),
    ...parseEnvFile(path.join(ROOT, ".env.local")),
  };
  const report = evaluateScaleReadiness({
    targetCases: Number(process.argv.find((arg, index) => process.argv[index - 1] === "--target-cases") || 10000),
    env: fileOnlyEnv,
  });
  const setup = {
    generated_at: new Date().toISOString(),
    target_cases: report.target_cases,
    overall_status: report.blockers.length ? "blocked" : "green",
    blockers: report.blockers,
    secrets: {
      openrouter_api_key: secretPresent(fileOnlyEnv, "OPENROUTER_API_KEY"),
      inngest_dev: secretPresent(fileOnlyEnv, "INNGEST_DEV"),
      inngest_event_key: secretPresent(fileOnlyEnv, "INNGEST_EVENT_KEY"),
      inngest_signing_key: secretPresent(fileOnlyEnv, "INNGEST_SIGNING_KEY"),
    },
    providers: {
      embedding: fileOnlyEnv.LEGAL_EMBEDDING_PROVIDER || "local-hash",
      rerank: fileOnlyEnv.LEGAL_RERANK_PROVIDER || "none",
    },
    gold_set: {
      answer_safe_count: report.current_batch.answer_safe_count,
      required: 3,
    },
    next_steps: [],
  };
  if (!setup.secrets.openrouter_api_key) {
    setup.next_steps.push("Add OPENROUTER_API_KEY to .env.local (gitignored) or Vercel Production, then run scripts/bootstrap_production_scale_env.js.");
  }
  if (!setup.secrets.inngest_dev && !setup.secrets.inngest_signing_key) {
    setup.next_steps.push("Set INNGEST_DEV=1 for local durable orchestration, or add INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY from https://app.inngest.com for cloud.");
  }
  if (setup.gold_set.answer_safe_count < 3) {
    setup.next_steps.push("Run node scripts/apply_bail_gold_review_set.js to promote the CFA bail gold set.");
  }
  if (!setup.next_steps.length) {
    setup.next_steps.push("All 10k preflight gates are green for this workspace.");
  }
  console.log(JSON.stringify(setup, null, 2));
  if (setup.overall_status !== "green") process.exit(1);
}

main();
