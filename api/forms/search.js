const { body, json, searchForms, storeFromReq } = require("./_utils");

module.exports = async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
    json(res, 405, { error: "method_not_allowed" });
    return;
  }
  const payload = body(req);
  const query = String(payload.query || req.query.q || req.query.query || "").trim();
  const filters = payload.filters || {
    practiceArea: req.query.practiceArea,
    matterType: req.query.matterType,
    documentIntent: req.query.documentIntent,
    workflowStage: req.query.workflowStage,
  };
  try {
    json(res, 200, searchForms({ store: storeFromReq(req), query, filters }));
  } catch (error) {
    json(res, error.statusCode || 400, { error: error.code || "forms_search_failed", message: error.message });
  }
};
