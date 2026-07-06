const { body, json, routeForms, storeFromReq } = require("./_utils");

module.exports = async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
    json(res, 405, { error: "method_not_allowed" });
    return;
  }
  const payload = body(req);
  try {
    const result = routeForms({
      store: storeFromReq(req),
      matter: payload.matter || {},
      query: String(payload.query || req.query.q || req.query.query || "").trim(),
      documentIntent: payload.documentIntent || req.query.documentIntent || "",
      workflowStage: payload.workflowStage || req.query.workflowStage || "",
    });
    json(res, 200, result);
  } catch (error) {
    json(res, error.statusCode || 400, { error: error.code || "forms_recommend_failed", message: error.message });
  }
};
