const { readJobManifest, markJobStatus } = require("../src/orchestration/durable_jobs");

function jsonResponse(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "PUT") {
    return jsonResponse(res, 405, { error: "method_not_allowed" });
  }

  let body = {};
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    return jsonResponse(res, 400, { error: "invalid_json" });
  }

  const eventName = body.name || body.event?.name || "";
  const data = body.data || body.event?.data || {};
  if (eventName !== "legal/case_scale.shard") {
    return jsonResponse(res, 202, {
      status: "ignored",
      reason: "unsupported_event",
      event: eventName,
    });
  }

  const jobId = data.job_id;
  if (!jobId) {
    return jsonResponse(res, 400, { error: "missing_job_id" });
  }

  const manifest = readJobManifest(jobId);
  if (!manifest) {
    return jsonResponse(res, 404, { error: "unknown_job_manifest", job_id: jobId });
  }

  markJobStatus(jobId, "received_by_inngest_webhook", {
    shard_id: data.shard_id || manifest.shard_id,
    checksum: data.checksum || manifest.checksum,
  });

  return jsonResponse(res, 200, {
    status: "accepted",
    workflow: "legal/case_scale.shard",
    job_id: jobId,
    shard_id: manifest.shard_id,
    message: "Shard job acknowledged. Execute ingest worker against manifest in artifacts/orchestration/case_scale_jobs.",
  });
};
