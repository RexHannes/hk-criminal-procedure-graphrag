#!/usr/bin/env node
const fs = require("fs");
const { assert, routeForms } = require("./forms_cli_common");
const { loadFormStore } = require("../src/forms/form_system");

const store = loadFormStore("fixtures/forms/approved_demo_subset_store");
assert(store.templates.length === 3, "Approved demo subset must contain exactly 3 PI templates");
assert(store.clauses.length >= 5 && store.clauses.length <= 10, "Approved demo subset must contain 5-10 clauses");
assert(store.templates.every(template => template.reviewStatus === "approved"), "All demo subset templates must be approved");
assert(store.templates.every(template => template.classificationStatus === "review_approved"), "All demo subset classifications must be review_approved");
assert(store.templates.every(template => template.activeInRouting === true), "Approved demo subset templates must be active in routing");
assert(store.clauses.every(clause => clause.reviewStatus === "approved"), "All demo subset clauses must be approved");
assert(store.clauses.every(clause => clause.sourceLocation?.privateTextCommitted === false), "Demo subset clauses must state privateTextCommitted=false");
assert(store.clauses.every(clause => !/Atkins|Dear Sirs|WITHOUT PREJUDICE/i.test(clause.text || "")), "Demo subset must not contain private/form text");

const routed = routeForms({
  store,
  query: "draft letter of claim for road traffic personal injury",
  matter: {
    practiceArea: "personal_injury",
    matterType: "road_traffic_pi",
    clientRole: "claimant",
    workflowStage: "PRE_ACTION_CORRESPONDENCE",
    opponentIdentified: true,
    medicalEvidenceReceived: true,
    specialDamagesEvidenceAvailable: true,
  },
  documentIntent: "LETTER_OF_CLAIM",
});
assert(routed.recommendedForms.some(item => item.template.documentIntent === "LETTER_OF_CLAIM"), "Approved letter template should route");
assert(routed.recommendedForms.every(item => item.template.reviewStatus === "approved"), "Only approved templates should route from approved subset");

const inactiveStore = {
  ...store,
  templates: store.templates.map(template => ({
    ...template,
    reviewStatus: "lawyer_review_required",
    classificationStatus: "machine_candidate",
    activeInRouting: false,
    routingActiveInDemo: false,
    demoFixture: false,
  })),
};
const inactive = routeForms({
  store: inactiveStore,
  query: "draft letter of claim for road traffic personal injury",
  matter: { practiceArea: "personal_injury", matterType: "road_traffic_pi", clientRole: "claimant" },
  documentIntent: "LETTER_OF_CLAIM",
});
assert(inactive.recommendedForms.length === 0, "Machine-candidate templates must not route without approval");

const report = JSON.parse(fs.readFileSync("artifacts/forms_approved_demo_subset_report.json", "utf8"));
assert(report.private_text_committed === false, "Approved demo report must state no private text committed");
assert(report.approved_templates === 3, "Approved demo report template count mismatch");

console.log("forms approved demo subset ok");
