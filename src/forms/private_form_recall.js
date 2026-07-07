const { routeForms } = require("./form_system");
const { buildPrivateFormBackendIndex } = require("./private_form_backend_index");

function recallPrivateForms({ store, matter = {}, query = "", documentIntent = "", workflowStage = "" }) {
  const routing = routeForms({ store, matter, query, documentIntent, workflowStage });
  const backendIndex = buildPrivateFormBackendIndex(store);
  return {
    recallVersion: "private-form-recall-v1",
    privateTextCommitted: false,
    publicAuthority: false,
    reviewedOnly: true,
    query,
    filters: {
      firmId: matter.firmId || "",
      workspaceId: matter.workspaceId || "",
      practiceLane: matter.practiceLane || matter.practiceArea || "",
      matterType: matter.matterType || "",
      clientRole: matter.clientRole || "",
      workflowStage: workflowStage || matter.workflowStage || "",
      documentIntent: documentIntent || matter.documentIntent || "",
    },
    recommended: routing.recommendedForms.map(item => ({
      templateId: item.template.id,
      title: item.template.title,
      documentIntent: item.template.documentIntent,
      workflowStage: item.template.proceduralStage,
      reviewStatus: item.template.reviewStatus,
      classificationStatus: item.template.classificationStatus,
      caveats: item.caveats || [],
      privateTextCommitted: false,
    })),
    blocked: routing.blockedForms.map(item => ({
      templateId: item.template.id,
      title: item.template.title,
      documentIntent: item.template.documentIntent,
      workflowStage: item.template.proceduralStage,
      reasons: item.blockedBy || [],
      privateTextCommitted: false,
    })),
    missingFacts: routing.missingFacts,
    requiredEvidence: routing.requiredEvidence,
    applicableClauses: routing.applicableClauses.map(clause => ({
      clauseId: clause.id,
      templateId: clause.templateId,
      heading: clause.heading,
      clauseType: clause.clauseType,
      privateTextCommitted: false,
    })),
    blockedClauses: routing.blockedClauses.map(item => ({
      clauseId: item.clause.id,
      templateId: item.clause.templateId,
      heading: item.clause.heading,
      reasons: item.reasons,
      privateTextCommitted: false,
    })),
    indexStats: {
      records: backendIndex.formIndex.records.length,
      flows: backendIndex.matterDocumentFlowIndex.flows.length,
      timelineRules: backendIndex.workflowTimelineRules.rules.length,
    },
    retrievalPolicy: routing.retrievalPolicy,
  };
}

module.exports = {
  recallPrivateForms,
};
