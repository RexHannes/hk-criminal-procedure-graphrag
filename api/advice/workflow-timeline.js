const { body, json, storeFromReq } = require("../forms/_utils");
const { buildPart2DocumentAdvice } = require("../../src/advice/part2_document_advice");
const { composeWorkflowTimeline } = require("../../src/advice/workflow_timeline_composer");
const { crmRowsToCsv } = require("../../src/advice/crm_export_composer");

module.exports = async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
    json(res, 405, { error: "method_not_allowed" });
    return;
  }
  const payload = body(req);
  try {
    const query = String(payload.query || req.query.q || req.query.query || "").trim();
    const matter = payload.matter || {};
    const part2 = buildPart2DocumentAdvice({
      store: storeFromReq(req),
      matter,
      query,
      documentIntent: payload.documentIntent || req.query.documentIntent || "",
      workflowStage: payload.workflowStage || req.query.workflowStage || "",
    });
    const timeline = composeWorkflowTimeline({
      part1LegalAnalysis: { status: "research_required" },
      documentaryFlow: part2.documentaryFlow,
    });
    if (String(req.query.format || payload.format || "").toLowerCase() === "csv") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.end(crmRowsToCsv(timeline.timeline));
      return;
    }
    json(res, 200, timeline);
  } catch (error) {
    json(res, error.statusCode || 400, { error: error.code || "workflow_timeline_failed", message: error.message });
  }
};
