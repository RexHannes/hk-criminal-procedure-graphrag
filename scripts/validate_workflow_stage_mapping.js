#!/usr/bin/env node
const { assert, loadSyntheticStore } = require("./forms_cli_common");
const { loadPiMotorAccidentFlow, WORKFLOW_STAGES } = require("../src/workflow/stage_taxonomy");

const PI_REQUIRED_STAGES = [
  "INTAKE",
  "URGENT_ACTIONS",
  "EVIDENCE_COLLECTION",
  "MEDICAL_EVIDENCE",
  "LIABILITY_ASSESSMENT",
  "PRE_ACTION_CORRESPONDENCE",
  "SETTLEMENT_NEGOTIATION",
  "COMMENCEMENT",
  "PLEADINGS",
  "DISCOVERY",
  "EXPERT_EVIDENCE",
  "MEDIATION",
  "TRIAL_PREPARATION",
  "TRIAL",
  "POST_JUDGMENT",
  "COSTS",
  "CLOSURE",
];

const flow = loadPiMotorAccidentFlow();
const stageSet = new Set(flow.stages.map(s => s.stage));
const taxonomySet = new Set(WORKFLOW_STAGES);
PI_REQUIRED_STAGES.forEach(stage => assert(stageSet.has(stage), `Missing PI workflow stage ${stage}`));
flow.stages.forEach(stage => assert(taxonomySet.has(stage.stage), `PI flow stage is absent from global taxonomy: ${stage.stage}`));
["DOCUMENT_DRAFTING", "TRANSACTIONAL_DRAFTING", "PROBATE_APPLICATION", "COMPANY_WINDING_UP", "COMPANY_COMPLIANCE", "REGULATORY_COMPLIANCE"].forEach(stage => {
  assert(taxonomySet.has(stage), `Missing forms workflow stage ${stage}`);
});
const store = loadSyntheticStore();
for (const template of store.templates) assert(stageSet.has(template.proceduralStage), `Template stage not in taxonomy: ${template.proceduralStage}`);
console.log("workflow stage mapping ok");
