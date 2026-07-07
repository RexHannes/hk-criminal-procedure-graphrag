const { json, readBody, routeForms, storeFromReq } = require("./_utils");
const { recallPrivateForms } = require("../../src/forms/private_form_recall");
const { recallPrivateFormsFromQdrant, privateQdrantEnabled } = require("../../src/forms/private_atkin_rag");
const { buildPrivateFormFramework } = require("../../src/forms/private_form_framework");
const { buildPart2DocumentAdvice } = require("../../src/advice/part2_document_advice");
const { composeWorkflowTimeline } = require("../../src/advice/workflow_timeline_composer");
const { crmRowsToCsv } = require("../../src/advice/crm_export_composer");

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

function queryBool(value) {
  if (value === undefined || value === null || value === "") return undefined;
  return ["1", "true", "yes", "y"].includes(String(value).toLowerCase());
}

module.exports = async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
    json(res, 405, { error: "method_not_allowed" });
    return;
  }
  try {
    const payload = await readBody(req);
    req.body = payload;
    const mode = String(payload.formsMode || payload.mode || req.query.formsMode || req.query.mode || "recommend").trim();
    const query = String(payload.query || req.query.q || req.query.query || "").trim();
    const queryMatter = {
      practiceArea: req.query.practiceArea,
      practiceLane: req.query.practiceLane,
      matterType: req.query.matterType,
      workflowStage: req.query.workflowStage,
      clientRole: req.query.clientRole,
      companyIdentified: queryBool(req.query.companyIdentified),
      debtOrGroundIdentified: queryBool(req.query.debtOrGroundIdentified),
      standingChecked: queryBool(req.query.standingChecked),
      statutoryDemandOrServiceEvidenceAvailable: queryBool(req.query.statutoryDemandOrServiceEvidenceAvailable),
      proceedingsIssued: queryBool(req.query.proceedingsIssued),
      respondentIdentified: queryBool(req.query.respondentIdentified),
      serviceAddressKnown: queryBool(req.query.serviceAddressKnown),
      serviceMethodSelected: queryBool(req.query.serviceMethodSelected),
      postTrialStage: queryBool(req.query.postTrialStage),
      urgencyGroundsIdentified: queryBool(req.query.urgencyGroundsIdentified),
      assetRiskEvidenceAvailable: queryBool(req.query.assetRiskEvidenceAvailable),
      voluntaryWindingUpOnly: queryBool(req.query.voluntaryWindingUpOnly),
      consentOrderAgreed: queryBool(req.query.consentOrderAgreed),
      proceedingsCommenced: queryBool(req.query.proceedingsCommenced),
    };
    Object.keys(queryMatter).forEach(key => queryMatter[key] === undefined && delete queryMatter[key]);
    const matter = {
      ...queryMatter,
      ...(payload.matter || {}),
      firmId: payload.firmId || req.query.firmId || payload.matter?.firmId,
      workspaceId: payload.workspaceId || req.query.workspaceId || payload.matter?.workspaceId,
    };
    const documentIntent = payload.documentIntent || req.query.documentIntent || "";
    const workflowStage = payload.workflowStage || req.query.workflowStage || "";
    if (mode === "private-recall") {
      json(res, 200, recallPrivateForms({
        store: storeFromReq(req),
        matter,
        query,
        documentIntent,
        workflowStage,
      }));
      return;
    }
    if (mode === "private-qdrant-recall") {
      if (!privateQdrantEnabled(process.env)) {
        json(res, 403, {
          error: "private_qdrant_forms_disabled",
          message: "Private Qdrant form recall is disabled unless PRIVATE_QDRANT_FORMS_ENABLED=true in server configuration.",
        });
        return;
      }
      const result = await recallPrivateFormsFromQdrant({
        store: storeFromReq(req),
        matter,
        query,
        documentIntent,
        workflowStage,
        env: process.env,
        execute: true,
        includePrivateSnippetText: String(process.env.PRIVATE_FORM_SNIPPET_TEXT_ENABLED || "false").toLowerCase() === "true",
      });
      json(res, 200, result);
      return;
    }
    if (mode === "private-form-framework") {
      json(res, 200, buildPrivateFormFramework({
        store: storeFromReq(req),
        matter,
        query,
        documentIntent,
        workflowStage,
      }));
      return;
    }
    if (mode === "matter-advice") {
      const part1LegalAnalysis = part1Placeholder({ query, matter });
      const part2 = buildPart2DocumentAdvice({
        store: storeFromReq(req),
        matter,
        query,
        documentIntent,
        workflowStage,
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
      return;
    }
    if (mode === "workflow-timeline") {
      const part2 = buildPart2DocumentAdvice({
        store: storeFromReq(req),
        matter,
        query,
        documentIntent,
        workflowStage,
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
      return;
    }
    const result = routeForms({
      store: storeFromReq(req),
      matter,
      query,
      documentIntent,
      workflowStage,
    });
    json(res, 200, result);
  } catch (error) {
    json(res, error.statusCode || 400, { error: error.code || "forms_recommend_failed", message: error.message });
  }
};
