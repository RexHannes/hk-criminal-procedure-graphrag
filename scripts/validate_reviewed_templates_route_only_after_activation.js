#!/usr/bin/env node
const { assert } = require("./forms_cli_common");
const { loadFormStore, routeForms } = require("../src/forms/form_system");

const store = loadFormStore("fixtures/forms/private_lane_company_winding_up_store");
const active = routeForms({
  store,
  query: "draft company winding-up petition",
  matter: {
    practiceArea: "company_corporate",
    matterType: "company_winding_up",
    workflowStage: "COMPANY_WINDING_UP",
    clientRole: "creditor",
    companyIdentified: true,
    debtOrGroundIdentified: true,
    standingChecked: true,
    statutoryDemandOrServiceEvidenceAvailable: true,
  },
  documentIntent: "COMPANY_WINDING_UP_PETITION",
});
assert(active.recommendedForms.length === 1, "Activated reviewed metadata should route");
assert(active.recommendedForms[0].template.reviewStatus === "approved", "Routed template must be approved");

const inactiveStore = {
  ...store,
  templates: store.templates.map(template => ({ ...template, reviewStatus: "lawyer_review_required", classificationStatus: "machine_candidate", activeInRouting: false })),
};
const inactive = routeForms({
  store: inactiveStore,
  query: "draft company winding-up petition",
  matter: { practiceArea: "company_corporate", matterType: "company_winding_up", workflowStage: "COMPANY_WINDING_UP", clientRole: "creditor" },
  documentIntent: "COMPANY_WINDING_UP_PETITION",
});
assert(inactive.recommendedForms.length === 0, "Same metadata must not route if review activation is removed");
console.log("reviewed templates route only after activation ok");
