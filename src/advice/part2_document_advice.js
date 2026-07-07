const { recallPrivateForms } = require("../forms/private_form_recall");
const { composeDocumentaryFlow } = require("./documentary_flow_composer");

function buildPart2DocumentAdvice({ store, matter = {}, query = "", documentIntent = "", workflowStage = "" }) {
  const recallResult = recallPrivateForms({ store, matter, query, documentIntent, workflowStage });
  return {
    recallResult,
    ...composeDocumentaryFlow({ recallResult, matter }),
  };
}

module.exports = {
  buildPart2DocumentAdvice,
};
