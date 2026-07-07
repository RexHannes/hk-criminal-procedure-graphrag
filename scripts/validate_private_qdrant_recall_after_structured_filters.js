#!/usr/bin/env node
const { assert } = require("./forms_cli_common");
const { loadFormStore } = require("../src/forms/form_system");
const { recallPrivateFormsFromQdrant } = require("../src/forms/private_atkin_rag");

const store = loadFormStore("fixtures/forms/private_lane_company_winding_up_store");
const env = { PRIVATE_QDRANT_FORMS_ENABLED: "true" };
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

(async () => {
  const positive = await recallPrivateFormsFromQdrant({
    store,
    matter: base,
    query: "draft company winding-up petition",
    documentIntent: "COMPANY_WINDING_UP_PETITION",
    workflowStage: "COMPANY_WINDING_UP",
    env,
    execute: false,
  });
  assert(positive.gate.can_execute_semantic === true, "Positive private Qdrant recall should pass structured gate");
  assert(positive.blockedBeforeSemantic === false, "Positive private Qdrant recall should not be blocked before semantic");
  assert(positive.qdrantExecuted === false && positive.dryRun === true, "Validator must not require live Qdrant");

  const wrongStage = await recallPrivateFormsFromQdrant({
    store,
    matter: { ...base, workflowStage: "PRE_ACTION_CORRESPONDENCE" },
    query: "use petition wording despite wrong stage",
    documentIntent: "COMPANY_WINDING_UP_PETITION",
    workflowStage: "PRE_ACTION_CORRESPONDENCE",
    env,
    execute: false,
  });
  assert(wrongStage.blockedBeforeSemantic === true, "Wrong stage must block before Qdrant semantic retrieval");
  assert(wrongStage.chunks.length === 0, "Wrong stage must not return chunks");

  const missingFact = await recallPrivateFormsFromQdrant({
    store,
    matter: { ...base, statutoryDemandOrServiceEvidenceAvailable: false },
    query: "use petition wording despite missing service evidence",
    documentIntent: "COMPANY_WINDING_UP_PETITION",
    workflowStage: "COMPANY_WINDING_UP",
    env,
    execute: false,
  });
  assert(missingFact.blockedBeforeSemantic === true, "Missing fact must block before Qdrant semantic retrieval");
  assert((missingFact.missingFacts || []).includes("statutoryDemandOrServiceEvidenceAvailable"), "Missing fact must be exposed");
  console.log("private qdrant recall after structured filters ok");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
