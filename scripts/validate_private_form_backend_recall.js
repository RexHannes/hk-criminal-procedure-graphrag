#!/usr/bin/env node
const fs = require("fs");
const { assert } = require("./forms_cli_common");
const { loadFormStore } = require("../src/forms/form_system");
const { recallPrivateForms } = require("../src/forms/private_form_recall");

const report = JSON.parse(fs.readFileSync("artifacts/private_form_backend_recall_report.json", "utf8"));
const formsRecommend = fs.readFileSync("api/forms/recommend.js", "utf8");
assert(formsRecommend.includes('mode === "private-recall"'), "Private recall mode missing from shared Forms API");
assert(formsRecommend.includes("recallPrivateForms"), "Private recall mode missing from shared Forms API handler");
assert(report.private_text_committed === false, "Recall report must not commit private text");
assert(report.public_authority === false, "Private recall must not be public authority");
assert(report.reviewed_only === true, "Recall must be reviewed-only");
assert(report.recommended_count >= 1, "Expected reviewed metadata to recall");
assert(report.required_evidence.includes("statutoryDemandOrServiceEvidenceAvailable"), "Recall should surface missing service evidence");

const store = loadFormStore("fixtures/forms/private_lane_company_winding_up_store");
const result = recallPrivateForms({
  store,
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
  query: "draft company winding-up petition",
  documentIntent: "COMPANY_WINDING_UP_PETITION",
});
assert(result.recommended.length === 1, "Reviewed company winding-up metadata should route");
assert(result.recommended.every(item => item.reviewStatus === "approved"), "Only approved templates should route");
console.log("private form backend recall ok");
