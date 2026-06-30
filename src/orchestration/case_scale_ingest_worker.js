const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { loadEnv } = require("../case_graph/scale_readiness");
const { markJobStatus, jobIdForShard } = require("../orchestration/durable_jobs");
const { assertProductionScaleRetrievalStack } = require("../retrieval/runtime_isolation");
const { validateShardRegistryScope } = require("../case_graph/scale_ingest_safeguards");

const ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_REGISTRY = path.join(
  ROOT,
  "data",
  "legal_ingest",
  "criminal_evidence_tree_v1",
  "case_registry_public_v1.json",
);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function casesForShard(registry, shard) {
  const start = Number(shard.case_ordinal_start || 1);
  const end = Number(shard.case_ordinal_end || start);
  const seeded = (registry.cases || []).filter(item => item.case_ordinal >= start && item.case_ordinal <= end);
  const pendingCount = Math.max(0, (end - start + 1) - seeded.length);
  return { seeded, pendingCount, start, end };
}

function batchesToIndex(seededCases) {
  const byBatch = new Map();
  for (const item of seededCases) {
    if (!byBatch.has(item.batch_id)) byBatch.set(item.batch_id, []);
    byBatch.get(item.batch_id).push(item);
  }
  return byBatch;
}

function runIndexer(batchId, env) {
  if (batchId === "criminal_bail_public_batch_v1") {
    const result = spawnSync(process.execPath, [path.join(ROOT, "scripts", "index_public_bail_batch_qdrant.js")], {
      cwd: ROOT,
      env: { ...process.env, ...env },
      encoding: "utf8",
    });
    return {
      batch_id: batchId,
      ok: result.status === 0,
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }
  return {
    batch_id: batchId,
    ok: false,
    status: "indexer_not_implemented_for_batch",
    stdout: "",
    stderr: "",
  };
}

function executeCaseScaleShard({
  plan,
  shard,
  registryPath = DEFAULT_REGISTRY,
  env = loadEnv({ root: ROOT }),
  dryRun = false,
} = {}) {
  if (!plan?.run_plan_id || !shard?.shard_id) {
    throw new Error("execute_case_scale_shard_missing_plan_or_shard");
  }
  if (!plan.execution_allowed) {
    throw new Error("execute_case_scale_shard_plan_not_execution_allowed");
  }
  if (Number(plan.target_cases || 0) > 50) {
    assertProductionScaleRetrievalStack(env, "execute_case_scale_shard");
  }
  const shardScope = validateShardRegistryScope({ plan, shard, registryPath });
  if (shardScope.seeded_cases.length && !shardScope.ok) {
    throw new Error(`execute_case_scale_shard_scope_blocked:${shardScope.errors.length}`);
  }
  const registry = readJson(registryPath);
  const { seeded, pendingCount, start, end } = casesForShard(registry, shard);
  const byBatch = batchesToIndex(seeded);
  const report = {
    worker: "case_scale_ingest_worker_v1",
    generated_at: new Date().toISOString(),
    run_plan_id: plan.run_plan_id,
    shard_id: shard.shard_id,
    case_ordinal_range: [start, end],
    seeded_cases_in_range: seeded.length,
    pending_discovery_in_range: pendingCount,
    dry_run: dryRun,
    runtime_mode: env.LEGAL_RUNTIME_MODE || "development",
    registry_id: registry.registry_id,
    shard_scope_ok: shardScope.ok,
    shard_scope_errors: shardScope.errors.slice(0, 10),
    seeded_case_ids: seeded.map(item => item.case_id),
    index_runs: [],
    status: "",
  };

  if (!seeded.length) {
    report.status = "pending_discovery_only";
    report.message = "No seeded public cases exist in this shard range yet.";
    return report;
  }

  if (dryRun) {
    report.status = "dry_run_ready";
    report.message = "Shard has seeded cases and passed production guards; indexing not executed.";
    report.batches = Array.from(byBatch.keys());
    return report;
  }

  for (const batchId of byBatch.keys()) {
    report.index_runs.push(runIndexer(batchId, env));
  }
  const skipped = report.index_runs.filter(item => item.status === "indexer_not_implemented_for_batch");
  const attempted = report.index_runs.filter(item => item.status !== "indexer_not_implemented_for_batch");
  const failed = attempted.filter(item => !item.ok);
  report.skipped_batches = skipped.map(item => item.batch_id);
  report.status = failed.length
    ? "indexed_with_failures"
    : skipped.length
      ? "indexed_seeded_cases_with_skipped_batches"
      : "indexed_seeded_cases";
  report.message = failed.length
    ? "Some batch indexers failed; inspect index_runs."
    : skipped.length
      ? "Seeded cases indexed; some pilot batches await dedicated indexers."
      : "Seeded cases in shard range indexed into isolated production Qdrant collections.";

  const jobId = jobIdForShard(plan.run_plan_id, shard.shard_id);
  try {
    markJobStatus(jobId, failed.length ? "failed" : "completed", {
      shard_id: shard.shard_id,
      seeded_cases_in_range: seeded.length,
      pending_discovery_in_range: pendingCount,
    });
  } catch {
    // Job manifest may not exist when execute is called directly.
  }
  return report;
}

module.exports = {
  DEFAULT_REGISTRY,
  batchesToIndex,
  casesForShard,
  executeCaseScaleShard,
};
