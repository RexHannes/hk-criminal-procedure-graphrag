#!/usr/bin/env node
const fs = require("fs");
const { assert } = require("./forms_cli_common");

const report = JSON.parse(fs.readFileSync("artifacts/notebooklm_crosscheck_report.json", "utf8"));
assert(report.private_note_text_committed === false, "NotebookLM crosscheck must not commit note text");
assert(report.notebooklm_is_authority === false, "NotebookLM must not be authority");
assert(report.provenance === "INTERNAL_USAGE_NOTE", "NotebookLM provenance must be internal usage note");
assert(report.scenario_count >= 1, "Expected at least one parsed/fallback scenario");
for (const scenario of report.scenarios) {
  assert(scenario.source_text_committed === false, `${scenario.scenario_id}: source text committed`);
  assert(scenario.expected_practice_lane, `${scenario.scenario_id}: missing expected practice lane`);
  assert(scenario.expected_workflow_stage, `${scenario.scenario_id}: missing expected workflow stage`);
  assert(Array.isArray(scenario.expected_recommended_forms), `${scenario.scenario_id}: recommended forms must be array`);
}
console.log("NotebookLM scenarios parse ok");
