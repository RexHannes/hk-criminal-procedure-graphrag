const { applyFormTemplate, body, json, storeFromReq } = require("./_utils");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    json(res, 405, { error: "method_not_allowed" });
    return;
  }
  try {
    const payload = body(req);
    json(res, 200, applyFormTemplate({
      store: storeFromReq(req),
      templateId: payload.templateId,
      matter: payload.matter || {},
      selectedClauseIds: payload.selectedClauseIds || null,
    }));
  } catch (error) {
    json(res, 400, { error: error.message });
  }
};
