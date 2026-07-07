const { body, json, storeFromReq } = require("../forms/_utils");
const { buildPart2DocumentAdvice } = require("../../src/advice/part2_document_advice");
const { composeWorkflowTimeline } = require("../../src/advice/workflow_timeline_composer");

function part1Placeholder({ query = "", matter = {} }) {
  return {
    status: "research_required",
    query,
    matterClassification: {
      practiceLane: matter.practiceLane || matter.practiceArea || "",
      matterType: matter.matterType || "",
      workflowStage: matter.workflowStage || "",
    },
    relevantIssues: [],
    publicAuthorities: [],
    legalUncertainties: ["Public source-backed legal analysis must be composed separately from private form routing."],
    unsupportedDomainAbstention: false,
    professionalAdviceCertified: false,
    provenance: ["SOURCE_BACKED_PUBLIC_AUTHORITY_LAYER_PLACEHOLDER"],
  };
}

module.exports = async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
    json(res, 405, { error: "method_not_allowed" });
    return;
  }
  const payload = body(req);
  try {
    const query = String(payload.query || req.query.q || req.query.query || "").trim();
    const matter = payload.matter || {};
    const part1LegalAnalysis = part1Placeholder({ query, matter });
    const part2 = buildPart2DocumentAdvice({
      store: storeFromReq(req),
      matter,
      query,
      documentIntent: payload.documentIntent || req.query.documentIntent || "",
      workflowStage: payload.workflowStage || req.query.workflowStage || "",
    });
    const part3WorkflowTimeline = composeWorkflowTimeline({
      part1LegalAnalysis,
      documentaryFlow: part2.documentaryFlow,
    });
    json(res, 200, {
      part1LegalAnalysis,
      part2DocumentaryFlow: part2.documentaryFlow,
      part3WorkflowTimeline,
      boundaries: {
        publicAuthoritySeparate: true,
        privateFormsSeparate: true,
        notebooklmInternalOnly: true,
        notLegalAdvice: true,
        lawyerReviewRequired: true,
        privateTextCommitted: false,
      },
    });
  } catch (error) {
    json(res, error.statusCode || 400, { error: error.code || "matter_advice_failed", message: error.message });
  }
};
