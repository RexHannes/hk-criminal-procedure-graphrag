const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { isDurableOrchestrationReady } = require("../retrieval/runtime_isolation");

const ROOT = path.resolve(__dirname, "..", "..");
const MANIFEST_ROOT = path.join(ROOT, "artifacts", "orchestration", "case_scale_jobs");

function jobIdForShard(runPlanId, shardId) {
  const digest = crypto.createHash("sha256").update(`${runPlanId}:${shardId}`).digest("hex").slice(0, 24);
  return `case_scale_${digest}`;
}

function manifestPath(jobId) {
  return path.join(MANIFEST_ROOT, `${jobId}.json`);
}

function readJobManifest(jobId) {
  const filePath = manifestPath(jobId);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJobManifest(manifest) {
  fs.mkdirSync(MANIFEST_ROOT, { recursive: true });
  const filePath = manifestPath(manifest.job_id);
  fs.writeFileSync(filePath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

async function sendInngestEvent({ name, data, env = process.env }) {
  if (!env.INNGEST_EVENT_KEY) {
    return { sent: false, reason: "missing_inngest_event_key" };
  }
  const base = String(env.INNGEST_EVENT_API_BASE || "https://inn.gs/e").replace(/\/$/, "");
  const response = await fetch(`${base}/${env.INNGEST_EVENT_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      data,
      ts: Date.now(),
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const error = new Error(`inngest_event_http_${response.status}`);
    error.response_body = text;
    throw error;
  }
  return { sent: true, status: response.status };
}

function enqueueCaseScaleShard({ plan, shard, env = process.env, status = "queued" } = {}) {
  if (!plan?.run_plan_id || !shard?.shard_id) {
    throw new Error("enqueue_case_scale_shard_missing_plan_or_shard");
  }
  if (!isDurableOrchestrationReady(env)) {
    throw new Error("durable_orchestration_not_configured");
  }
  const now = new Date().toISOString();
  const jobId = jobIdForShard(plan.run_plan_id, shard.shard_id);
  const existing = readJobManifest(jobId);
  const manifest = {
    job_id: jobId,
    workflow: "legal/case_scale.shard",
    run_plan_id: plan.run_plan_id,
    shard_id: shard.shard_id,
    shard,
    target_cases: plan.target_cases,
    scope: plan.scope,
    status: existing?.status === "completed" ? existing.status : status,
    attempts: existing?.attempts || 0,
    checksum: crypto.createHash("sha256").update(JSON.stringify(shard)).digest("hex"),
    created_at: existing?.created_at || now,
    updated_at: now,
    resume_manifest_required: true,
    idempotent_upserts_required: true,
  };
  writeJobManifest(manifest);
  return manifest;
}

async function dispatchCaseScaleShard({ plan, shard, env = process.env } = {}) {
  const manifest = enqueueCaseScaleShard({ plan, shard, env, status: "queued" });
  const event = await sendInngestEvent({
    name: "legal/case_scale.shard",
    data: {
      job_id: manifest.job_id,
      run_plan_id: manifest.run_plan_id,
      shard_id: manifest.shard_id,
      checksum: manifest.checksum,
      target_cases: manifest.target_cases,
      scope: manifest.scope,
    },
    env,
  });
  manifest.last_dispatch = {
    at: new Date().toISOString(),
    inngest_event_sent: event.sent,
    inngest_status: event.status || null,
    inngest_reason: event.reason || null,
  };
  manifest.status = event.sent ? "dispatched" : "queued_local_manifest_only";
  writeJobManifest(manifest);
  return { manifest, dispatch: event };
}

function markJobStatus(jobId, status, details = {}) {
  const manifest = readJobManifest(jobId);
  if (!manifest) throw new Error(`unknown_job_manifest:${jobId}`);
  manifest.status = status;
  manifest.updated_at = new Date().toISOString();
  manifest.attempts = Number(manifest.attempts || 0) + (status === "running" ? 1 : 0);
  manifest.last_result = details;
  writeJobManifest(manifest);
  return manifest;
}

module.exports = {
  MANIFEST_ROOT,
  dispatchCaseScaleShard,
  enqueueCaseScaleShard,
  jobIdForShard,
  markJobStatus,
  readJobManifest,
  sendInngestEvent,
  writeJobManifest,
};
