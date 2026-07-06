#!/usr/bin/env node
const { assert, loadSyntheticStore } = require("./forms_cli_common");
const { loadPiMotorAccidentFlow, WORKFLOW_STAGES } = require("../src/workflow/stage_taxonomy");

const flow = loadPiMotorAccidentFlow();
assert(flow.stages.length === WORKFLOW_STAGES.length, "PI flow must define all required stages");
const stageSet = new Set(flow.stages.map(s => s.stage));
WORKFLOW_STAGES.forEach(stage => assert(stageSet.has(stage), `Missing workflow stage ${stage}`));
const store = loadSyntheticStore();
for (const template of store.templates) assert(stageSet.has(template.proceduralStage), `Template stage not in taxonomy: ${template.proceduralStage}`);
console.log("workflow stage mapping ok");
