const { assertReviewAdmin, json, supabaseConfig } = require("../src/api/legal-ingest/_utils");
const {
  buildCaseFruitSopBridge,
  writeCaseFruitSopBridgeCache,
} = require("../src/case_graph/case_fruit_sop_bridge");

function nodeIdFromReq(req) {
  return String(req.query.node_id || req.query.doctrine_node_id || "criminal_procedure_hk.bail_factors").trim();
}

function queryFromReq(req, nodeId) {
  return String(req.query.q || req.query.query || `SOP from case fruits for ${nodeId}`).trim();
}

module.exports = async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
    json(res, 405, { error: "method_not_allowed" });
    return;
  }

  const doctrineNodeId = nodeIdFromReq(req);
  if (!doctrineNodeId) {
    json(res, 400, { error: "missing_node_id" });
    return;
  }

  const query = queryFromReq(req, doctrineNodeId);
  const wantsCacheWrite = req.method === "POST" && (req.body?.write_cache === true || req.query.write_cache === "1");

  if (!wantsCacheWrite) {
    try {
      const bridge = buildCaseFruitSopBridge({ doctrineNodeId, query });
      json(res, 200, {
        status: "ok",
        cache_write: "not_requested",
        ...bridge,
      });
    } catch (error) {
      json(res, 500, { status: "failed", error: error.message });
    }
    return;
  }

  try {
    assertReviewAdmin(req);
  } catch (error) {
    json(res, error.status || 401, { error: error.message });
    return;
  }

  const config = supabaseConfig();
  if (!config.configured) {
    json(res, 503, {
      error: "supabase_not_configured",
      message: "Writing SOP cache records requires Supabase server-side credentials.",
    });
    return;
  }

  try {
    const bridge = await writeCaseFruitSopBridgeCache({ doctrineNodeId, query });
    json(res, 200, {
      status: "ok",
      cache_write: bridge.cache_write,
      ...bridge,
    });
  } catch (error) {
    json(res, 502, {
      status: "cache_write_failed",
      error: error.message,
      details: error.payload || null,
    });
  }
};
