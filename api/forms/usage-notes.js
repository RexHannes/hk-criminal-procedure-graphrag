const { json, storeFromReq } = require("./_utils");

module.exports = async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
    json(res, 405, { error: "method_not_allowed" });
    return;
  }
  const store = storeFromReq(req);
  json(res, 200, {
    status: "ok",
    provenanceLabel: "INTERNAL_USAGE_NOTE",
    notes: store.notebooklmUsageNotes || [],
  });
};
