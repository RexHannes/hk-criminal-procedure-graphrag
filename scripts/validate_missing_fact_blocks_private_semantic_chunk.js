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
    serviceAddressKnown: false,
    serviceMethodSelected: true,
  },
  query: "family service acknowledgment service address respondent method",
  documentIntent: "FAMILY_SERVICE_ACKNOWLEDGMENT",
  workflowStage: "FAMILY_SERVICE",
});

assert(result.recommended.length >= 1, "Missing service address may allow placeholder-only route");
assert(result.missingFacts.includes("serviceAddressKnown") || result.requiredEvidence.includes("serviceAddressKnown"), "Missing fact must be surfaced");
assert(result.semanticClauseRetrieval.semanticExecuted === false, "Missing fact should block semantic retrieval");
assert(result.semanticClauseRetrieval.indexStats.returnedChunks === 0, "Missing fact should block private semantic chunk");
console.log("missing fact blocks private semantic chunk ok");
