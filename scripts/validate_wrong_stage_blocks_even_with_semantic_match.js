#!/usr/bin/env node
const { assert } = require("./forms_cli_common");
const { loadFormStore } = require("../src/forms/form_system");
const { recallPrivateForms } = require("../src/forms/private_form_recall");

const store = loadFormStore("fixtures/forms/private_lane_family_service_store");
const result = recallPrivateForms({
  store,
  matter: {
    practiceArea: "family_service",
    practiceLane: "family_service",
    matterType: "family_service",
    workflowStage: "FAMILY_SERVICE",
    clientRole: "applicant",
    proceedingsIssued: true,
    respondentIdentified: true,
    serviceAddressKnown: true,
    serviceMethodSelected: true,
    postTrialStage: true,
  },
  query: "family service acknowledgment service address respondent method strong semantic match",
  documentIntent: "FAMILY_SERVICE_ACKNOWLEDGMENT",
  workflowStage: "FAMILY_SERVICE",
});

assert(result.recommended.length === 0, "Wrong stage should block recommendation despite semantic match");
assert(result.blocked.length >= 1, "Wrong stage should produce blocked form");
assert(result.semanticClauseRetrieval.semanticExecuted === false, "Semantic retrieval must not execute after wrong-stage block");
assert(result.semanticClauseRetrieval.indexStats.returnedChunks === 0, "No semantic chunks should leak through wrong-stage block");
console.log("wrong stage blocks even with semantic match ok");
