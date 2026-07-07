#!/usr/bin/env node
const fs = require("fs");
const { assert } = require("./forms_cli_common");
const { loadFormStore, routeForms } = require("../src/forms/form_system");

const report = JSON.parse(fs.readFileSync("artifacts/private_lane_routing_fixtures_report.json", "utf8"));
const store = loadFormStore("fixtures/forms/private_lane_company_winding_up_store");

assert(report.selected_lane === "company_winding_up", "Routing fixtures must target company_winding_up");
assert(report.private_text_committed === false, "Routing fixtures must not commit private text");
assert(report.public_authority_analysis_separate === true, "Public authority analysis must remain separate from forms routing");
assert(report.all_scenarios_passed === true, "All private lane routing scenarios must pass");
assert(report.scenarios.length === 3, "Expected exactly 3 lane routing scenarios");

const correct = routeForms({
  store,
  query: "draft company winding-up petition for creditor after statutory demand service evidence is available",
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
assert(correct.recommendedForms.length === 1, "Correct stage should recommend approved winding-up metadata form");
assert(correct.recommendedForms[0].template.reviewStatus === "approved", "Only approved template may route");

const wrongStage = routeForms({
  store,
  query: "draft company winding-up petition but company is already in another procedure",
  matter: {
    practiceArea: "company_corporate",
    matterType: "company_winding_up",
    workflowStage: "COMPANY_WINDING_UP",
    clientRole: "creditor",
    companyIdentified: true,
    debtOrGroundIdentified: true,
    standingChecked: true,
    statutoryDemandOrServiceEvidenceAvailable: true,
    companyInExistingProcedure: true,
  },
  documentIntent: "COMPANY_WINDING_UP_PETITION",
});
assert(wrongStage.recommendedForms.length === 0, "Wrong-stage scenario should not recommend the petition");
assert(wrongStage.blockedForms.length === 1, "Wrong-stage scenario should block the petition");

const missing = routeForms({
  store,
  query: "draft company winding-up petition but statutory demand service evidence is missing",
  matter: {
    practiceArea: "company_corporate",
    matterType: "company_winding_up",
    workflowStage: "COMPANY_WINDING_UP",
    clientRole: "creditor",
    companyIdentified: true,
    debtOrGroundIdentified: true,
    standingChecked: true,
    statutoryDemandOrServiceEvidenceAvailable: false,
  },
  documentIntent: "COMPANY_WINDING_UP_PETITION",
});
assert(missing.recommendedForms.length === 1, "Missing prerequisite scenario may produce placeholder-only draft route");
assert(missing.requiredEvidence.includes("statutoryDemandOrServiceEvidenceAvailable"), "Missing prerequisite must create evidence blocker");
assert(missing.recommendedForms[0].caveats.some(caveat => caveat.severity === "placeholder_only"), "Missing prerequisite must be placeholder-only");

console.log("private lane routing fixtures ok");
