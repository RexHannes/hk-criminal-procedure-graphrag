const { buildPrivateFormIndex } = require("./form_system");
const { buildMatterDocumentFlowIndex, buildWorkflowTimelineRules } = require("./form_to_workflow_mapper");

function buildPrivateFormBackendIndex(store) {
  return {
    indexVersion: "private-form-backend-index-v1",
    privateTextCommitted: false,
    publicAuthority: false,
    formIndex: buildPrivateFormIndex(store),
    matterDocumentFlowIndex: buildMatterDocumentFlowIndex(store),
    workflowTimelineRules: buildWorkflowTimelineRules(store),
  };
}

module.exports = {
  buildPrivateFormBackendIndex,
};
