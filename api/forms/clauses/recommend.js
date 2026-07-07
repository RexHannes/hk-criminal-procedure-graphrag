const { body, json, recommendClauses, storeFromReq } = require("../_utils");

module.exports = async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
    json(res, 405, { error: "method_not_allowed" });
    return;
  }
  try {
    const payload = body(req);
    json(res, 200, recommendClauses({
      store: storeFromReq(req),
      matter: payload.matter || {},
      query: String(payload.query || req.query.q || req.query.query || "").trim(),
      documentIntent: payload.documentIntent || req.query.documentIntent || "",
    }));
  } catch (error) {
    json(res, error.statusCode || 400, { error: error.code || "forms_clause_recommend_failed", message: error.message });
  }
};
