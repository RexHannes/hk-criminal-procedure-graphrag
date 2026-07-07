#!/usr/bin/env node
const { assert } = require("./forms_cli_common");
const { parseNotebooklmScenarios } = require("../src/forms/notebooklm_scenario_parser");
const { loadFormStore, routeForms } = require("../src/forms/form_system");

const parsed = parseNotebooklmScenarios();
assert(parsed.notebooklmIsAuthority === false, "NotebookLM parser must mark notes non-authority");

const store = loadFormStore("fixtures/forms/private_lane_family_service_store");
const inactiveStore = {
  ...store,
  templates: store.templates.map(template => ({
    ...template,
    reviewStatus: "lawyer_review_required",
    classificationStatus: "machine_candidate",
    activeInRouting: false,
  })),
};
const routed = routeForms({
  store: inactiveStore,
  query: "NotebookLM expects family service acknowledgment form",
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
  },
  documentIntent: "FAMILY_SERVICE_ACKNOWLEDGMENT",
  workflowStage: "FAMILY_SERVICE",
});
assert(routed.recommendedForms.length === 0, "NotebookLM expectations must not activate unreviewed templates");
console.log("NotebookLM does not override review gates ok");
