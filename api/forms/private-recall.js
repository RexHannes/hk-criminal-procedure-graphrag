const { body, json, storeFromReq } = require("./_utils");
const { recallPrivateForms } = require("../../src/forms/private_form_recall");

module.exports = async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
    json(res, 405, { error: "method_not_allowed" });
    return;
  }
  const payload = body(req);
  try {
    const query = String(payload.query || req.query.q || req.query.query || "").trim();
    const matter = {
      ...(payload.matter || {}),
      firmId: payload.firmId || req.query.firmId,
      workspaceId: payload.workspaceId || req.query.workspaceId,
    };
    const result = recallPrivateForms({
      store: storeFromReq(req),
      matter,
      query,
      documentIntent: payload.documentIntent || req.query.documentIntent || "",
      workflowStage: payload.workflowStage || req.query.workflowStage || "",
    });
    json(res, 200, result);
  } catch (error) {
    json(res, error.statusCode || 400, { error: error.code || "private_form_recall_failed", message: error.message });
  }
};
