#!/usr/bin/env node
const { assert } = require("./forms_cli_common");
const { loadFormStore } = require("../src/forms/form_system");
const { recallPrivateForms } = require("../src/forms/private_form_recall");

const store = loadFormStore("fixtures/forms/private_lane_company_provisional_liquidator_store");
const base = {
  practiceArea: "company_corporate",
  practiceLane: "company_winding_up",
  matterType: "provisional_liquidator",
  workflowStage: "PROVISIONAL_LIQUIDATOR",
  clientRole: "creditor",
  companyIdentified: true,
  standingChecked: true,
  urgencyGroundsIdentified: true,
  assetRiskEvidenceAvailable: true,
};

const ready = recallPrivateForms({
  store,
  matter: base,
  query: "draft provisional liquidator application",
  documentIntent: "COMPANY_PROVISIONAL_LIQUIDATOR_APPLICATION",
  workflowStage: "PROVISIONAL_LIQUIDATOR",
});
const missing = recallPrivateForms({
  store,
  matter: { ...base, assetRiskEvidenceAvailable: false },
  query: "draft provisional liquidator application",
  documentIntent: "COMPANY_PROVISIONAL_LIQUIDATOR_APPLICATION",
  workflowStage: "PROVISIONAL_LIQUIDATOR",
});
const wrongPath = recallPrivateForms({
  store,
  matter: { ...base, voluntaryWindingUpOnly: true },
  query: "draft provisional liquidator application",
  documentIntent: "COMPANY_PROVISIONAL_LIQUIDATOR_APPLICATION",
  workflowStage: "PROVISIONAL_LIQUIDATOR",
});

assert(ready.recommended.length >= 1, "Ready facts should recommend provisional liquidator form metadata");
assert(ready.semanticClauseRetrieval.indexStats.returnedChunks >= 1, "Ready facts should retrieve approved chunks");
assert(missing.requiredEvidence.includes("assetRiskEvidenceAvailable") || missing.missingFacts.includes("assetRiskEvidenceAvailable"), "Missing asset-risk evidence should surface blocker");
assert(missing.semanticClauseRetrieval.indexStats.returnedChunks === 0, "Missing fact should block semantic chunks");
assert(wrongPath.recommended.length === 0, "Wrong path should alter recommendation set");
assert(wrongPath.blocked.length >= 1, "Wrong path should block forms");
console.log("runtime matter facts change forms ok");
