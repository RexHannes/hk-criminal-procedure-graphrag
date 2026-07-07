#!/usr/bin/env node
const fs = require("fs");
const { assert } = require("./forms_cli_common");

const taxonomy = JSON.parse(fs.readFileSync("data/forms/practice_lane_taxonomy.json", "utf8"));
const lanes = taxonomy.lanes || [];
const required = [
  "personal_injury",
  "company_winding_up",
  "company_corporate",
  "commercial_contract",
  "probate",
  "employment",
  "equitable_remedies",
  "financial_regulatory",
  "general_civil_procedure",
];
assert(taxonomy.source_boundary?.private_forms_are_authority === false, "Private forms must not be authority");
for (const laneId of required) {
  const lane = lanes.find(item => item.laneId === laneId);
  assert(lane, `Missing lane ${laneId}`);
  assert((lane.matterTypes || []).length, `${laneId}: missing matter types`);
  assert((lane.commonDocumentIntents || []).length, `${laneId}: missing document intents`);
  assert((lane.workflowStages || []).length, `${laneId}: missing workflow stages`);
  assert((lane.requiredFacts || []).length, `${laneId}: missing required facts`);
  assert(lane.sourceBoundary === "private_template_metadata_only", `${laneId}: wrong source boundary`);
}
console.log("practice lane taxonomy ok");
