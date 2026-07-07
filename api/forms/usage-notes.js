const { json, storeFromReq } = require("./_utils");

module.exports = async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
    json(res, 405, { error: "method_not_allowed" });
    return;
  }
  try {
    const store = storeFromReq(req);
    json(res, 200, {
      status: "ok",
      provenanceLabel: "INTERNAL_USAGE_NOTE",
      notes: store.notebooklmUsageNotes || [],
    });
  } catch (error) {
    json(res, error.statusCode || 400, { error: error.code || "forms_usage_notes_failed", message: error.message });
  }
};
