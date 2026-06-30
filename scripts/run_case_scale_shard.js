#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");
const { dispatchCaseScaleShard, jobIdForShard, markJobStatus } = require("../src/orchestration/durable_jobs");
const { validateShardRegistryScope } = require("../src/case_graph/scale_ingest_safeguards");
const { assertProductionScaleRetrievalStack, runtimeIsolationReport } = require("../src/retrieval/runtime_isolation");

const ROOT = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const args = {
    plan: "",
    shardId: "",
    output: "",
    preflightOnly: false,
    dispatch: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--plan") args.plan = path.resolve(ROOT, argv[++i] || "");
    else if (arg === "--shard-id") args.shardId = argv[++i] || "";
    else if (arg === "--output") args.output = path.resolve(ROOT, argv[++i] || "");
    else if (arg === "--preflight-only") args.preflightOnly = true;
    else if (arg === "--dispatch") args.dispatch = true;
  }
  return args;
}

function writeOutput(outputPath, report) {
  if (!outputPath) return;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
}

const args = parseArgs(process.argv);
if (!args.plan) throw new Error("plan required");
if (!args.shardId) throw new Error("shard-id required");

const plan = JSON.parse(fs.readFileSync(args.plan, "utf8"));
const shard = (plan.shards || []).find(item => item.shard_id === args.shardId);
if (!shard) throw new Error(`unknown_shard_id:${args.shardId}`);
const allowedScopes = [
  "bail_only",
  "public_order_riot",
  "sedition_public_expression",
  "public_order_unlawful_assembly_riot_candidate_branch",
  "sedition_public_expression_candidate_branch",
  "criminal_domain_public_cases",
];
const registryScopeCheck = validateShardRegistryScope({
  registryCases: plan.registry_cases || [],
  allowedScopes,
});

const report = {
  shard_executor: "case_scale_shard_guard_v2",
  generated_at: new Date().toISOString(),
  run_plan_id: plan.run_plan_id,
  readiness_status: plan.readiness_status,
  plan_status: plan.status,
  execution_allowed: Boolean(plan.execution_allowed),
  preflight_only: args.preflightOnly,
  runtime_isolation: runtimeIsolationReport(process.env),
  shard,
  status: "",
  blockers: plan.blockers || [],
  registry_scope_check: registryScopeCheck,
};

if (!registryScopeCheck.ok) {
  report.status = "blocked_by_registry_scope";
  report.message = "Shard execution refused because registry cases include non-criminal or citation-invalid sources.";
  writeOutput(args.output, report);
  console.log(JSON.stringify(report, null, 2));
  process.exit(args.preflightOnly ? 0 : 1);
}

if (!plan.execution_allowed) {
  report.status = "blocked_by_scale_readiness";
  report.message = "Shard execution refused because the run plan is not execution_allowed.";
  writeOutput(args.output, report);
  console.log(JSON.stringify(report, null, 2));
  process.exit(args.preflightOnly ? 0 : 1);
}

if (Number(plan.target_cases || 0) > 50) {
  try {
    assertProductionScaleRetrievalStack(process.env, "case_scale_shard");
  } catch (error) {
    report.status = "blocked_by_runtime_isolation";
    report.message = error.message;
    report.runtime_blockers = error.blockers || [];
    writeOutput(args.output, report);
    console.log(JSON.stringify(report, null, 2));
    process.exit(args.preflightOnly ? 0 : 1);
  }
}

const shardScope = validateShardRegistryScope({ plan, shard });
report.shard_scope = {
  ok: shardScope.ok,
  seeded_case_count: shardScope.seeded_cases.length,
  batch_ids: shardScope.batch_ids,
  error_count: shardScope.errors.length,
};
if (shardScope.seeded_cases.length && !shardScope.ok) {
  report.status = "blocked_by_shard_scope_policy";
  report.message = "Shard contains registry cases outside allowed criminal public-demo scope or with invalid citations.";
  report.shard_scope_errors = shardScope.errors.slice(0, 20);
  writeOutput(args.output, report);
  console.log(JSON.stringify(report, null, 2));
  process.exit(args.preflightOnly ? 0 : 1);
}

const jobId = jobIdForShard(plan.run_plan_id, shard.shard_id);

async function finish() {
  if (args.dispatch && !args.preflightOnly) {
    const dispatched = await dispatchCaseScaleShard({ plan, shard, env: process.env });
    report.orchestration = dispatched;
    markJobStatus(jobId, "ready_for_ingest_worker", { shard_id: shard.shard_id });
    report.status = "dispatched_to_durable_orchestration";
    report.message = "Shard passed readiness guard and was queued through durable orchestration.";
  } else {
    report.status = args.preflightOnly ? "preflight_passed_not_executed" : "ready_for_ingest_worker";
    report.message = args.preflightOnly
      ? "Shard readiness passed; no ingestion was performed."
      : "Shard passed readiness guard. Attach a real ingest worker here or rerun with --dispatch.";
  }

  writeOutput(args.output, report);
  console.log(JSON.stringify(report, null, 2));
}

finish().catch(error => {
  report.status = "shard_executor_failed";
  report.message = error.message;
  writeOutput(args.output, report);
  console.log(JSON.stringify(report, null, 2));
  process.exit(1);
});
