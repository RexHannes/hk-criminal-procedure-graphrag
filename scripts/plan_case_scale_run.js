#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");
const { evaluateScaleReadiness, loadEnv } = require("../src/case_graph/scale_readiness");
const { runtimeIsolationReport } = require("../src/retrieval/runtime_isolation");

const ROOT = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const args = {
    targetCases: 20000,
    scope: "criminal_domain_public_cases",
    casesPerShard: 100,
    output: "",
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--target-cases") args.targetCases = Number(argv[++i] || 20000);
    else if (arg === "--scope") args.scope = argv[++i] || args.scope;
    else if (arg === "--cases-per-shard") args.casesPerShard = Number(argv[++i] || 100);
    else if (arg === "--output") args.output = argv[++i] || "";
  }
  return args;
}

function makeShards({ targetCases, casesPerShard, executionAllowed }) {
  const shards = [];
  let start = 1;
  let index = 1;
  while (start <= targetCases) {
    const end = Math.min(targetCases, start + casesPerShard - 1);
    shards.push({
      shard_id: `shard_${String(index).padStart(4, "0")}`,
      case_ordinal_start: start,
      case_ordinal_end: end,
      max_cases: end - start + 1,
      status: executionAllowed ? "planned_not_started" : "blocked_preflight_only",
    });
    start = end + 1;
    index += 1;
  }
  return shards;
}

function buildPlan(args) {
  const env = loadEnv({ root: ROOT });
  const readiness = evaluateScaleReadiness({ targetCases: args.targetCases, env });
  const shardPolicy = readiness.selected_rung?.shard_policy || {};
  const maxCasesPerShard = readiness.selected_rung?.max_cases_per_shard || 250;
  const casesPerShard = Math.min(args.casesPerShard, maxCasesPerShard, 250);
  return {
    run_plan_id: `case_scale_${args.scope}_${args.targetCases}_v1`,
    generated_at: new Date().toISOString(),
    target_cases: args.targetCases,
    scope: args.scope,
    runtime_mode: env.LEGAL_RUNTIME_MODE || "development",
    runtime_isolation: runtimeIsolationReport(env),
    execution_allowed: readiness.execution_allowed,
    status: readiness.execution_allowed ? "planned_ready_for_allowed_rung" : "blocked_preflight_only",
    readiness_status: readiness.status,
    blockers: readiness.blockers,
    warnings: readiness.warnings || [],
    selected_rung: readiness.selected_rung,
    shard_policy: {
      cases_per_shard: casesPerShard,
      requires_checksum_dedup: true,
      requires_idempotent_upserts: true,
      requires_resume_manifest: true,
      max_parallel_shards_without_orchestrator: 1,
      ...shardPolicy,
    },
    shards: makeShards({
      targetCases: args.targetCases,
      casesPerShard,
      executionAllowed: readiness.execution_allowed,
    }),
    safeguards: [
      "No private or licensed source material in public scale runs.",
      "No proposition may be emitted without exact quote validation.",
      "No doctrine-node link may become answer_safe through this run plan.",
      "No cross-domain auto-attach unless readiness status is green_for_requested_target.",
      "All machine-generated outputs must enter the review queue as machine_candidate.",
      "Production scale runs require LEGAL_RUNTIME_MODE=production_scale with isolated _prod Qdrant collections.",
      "Local-hash embeddings and local/none rerankers are blocked in production_scale mode.",
      "Qdrant retrieval must filter domain_id, practice_area, source_visibility and tenant_id in production_scale.",
      "Shard cases must match criminal public-demo scopes with valid HK neutral citations and LegalRef DIS pins.",
      "Doctrine links must stay within manifest target_doctrine_node_ids; non-criminal domain packs are forbidden.",
    ],
  };
}

const args = parseArgs(process.argv);
const plan = buildPlan(args);
if (args.output) {
  const outputPath = path.resolve(ROOT, args.output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(plan, null, 2)}\n`);
}
console.log(JSON.stringify(plan, null, 2));

