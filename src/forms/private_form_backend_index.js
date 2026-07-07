const { buildPrivateFormIndex } = require("./form_system");
const { buildMatterDocumentFlowIndex, buildWorkflowTimelineRules } = require("./form_to_workflow_mapper");
const { buildPrivateClauseVectorIndex } = require("./private_clause_semantic_retrieval");

function buildPrivateFormBackendIndex(store) {
  return {
    indexVersion: "private-form-backend-index-v1",
    privateTextCommitted: false,
    publicAuthority: false,
    formIndex: buildPrivateFormIndex(store),
    privateClauseVectorIndex: buildPrivateClauseVectorIndex(store),
    matterDocumentFlowIndex: buildMatterDocumentFlowIndex(store),
    workflowTimelineRules: buildWorkflowTimelineRules(store),
  };
}

module.exports = {
  buildPrivateFormBackendIndex,
};
