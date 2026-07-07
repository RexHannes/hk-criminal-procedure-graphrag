#!/usr/bin/env node
const { assert } = require("./forms_cli_common");
const { loadFormStore } = require("../src/forms/form_system");
const { recallPrivateForms } = require("../src/forms/private_form_recall");

const store = loadFormStore("fixtures/forms/private_lane_company_winding_up_store");

const base = {
  firmId: "private-lane-pilot-firm",
  workspaceId: "company-winding-up-pilot",
  practiceArea: "company_corporate",
  practiceLane: "company_winding_up",
  matterType: "company_winding_up",
  workflowStage: "COMPANY_WINDING_UP",
  clientRole: "creditor",
  companyIdentified: true,
  debtOrGroundIdentified: true,
  standingChecked: true,
  statutoryDemandOrServiceEvidenceAvailable: true,
};

function recall(label, matterPatch, documentIntent = "COMPANY_WINDING_UP_PETITION", workflowStage = "COMPANY_WINDING_UP") {
  const result = recallPrivateForms({
    store,
    matter: { ...base, ...matterPatch },
    query: `${label}: draft company winding-up petition redacted evidence gate service evidence clause`,
    documentIntent,
    workflowStage,
  });
  return result.semanticClauseRetrieval;
}

const blockedCases = [
  ["wrong practice lane", { practiceArea: "personal_injury", practiceLane: "road_traffic_pi", matterType: "road_traffic_pi" }],
  ["wrong workflow stage", { workflowStage: "PRE_ACTION_CORRESPONDENCE" }, "COMPANY_WINDING_UP_PETITION", "PRE_ACTION_CORRESPONDENCE"],
  ["wrong document intent", {}, "LETTER_OF_CLAIM", "COMPANY_WINDING_UP"],
  ["wrong client role", { clientRole: "debtor" }],
  ["wrong matter type", { matterType: "commercial_contract" }],
  ["missing service evidence", { statutoryDemandOrServiceEvidenceAvailable: false }],
  ["company already in procedure", { companyInExistingProcedure: true }],
];

for (const [label, matterPatch, intent, stage] of blockedCases) {
  const retrieval = recall(label, matterPatch, intent, stage);
  assert(retrieval.vectorCannotOverrideStructuredBlockers === true, `${label}: vector override guard missing`);
  assert(retrieval.semanticExecuted === false, `${label}: semantic retrieval should not execute`);
  assert(retrieval.indexStats.returnedChunks === 0, `${label}: semantic retrieval returned chunks despite blocker`);
  assert(retrieval.chunks.length === 0, `${label}: chunks leaked through structured blocker`);
}

const positive = recall("positive", {});
assert(positive.semanticExecuted === true, "Positive scenario should execute semantic retrieval");
assert(positive.indexStats.returnedChunks >= 1, "Positive scenario should return chunks");

console.log("private vector cannot override structured blockers ok");
