#!/usr/bin/env node
const fs = require("fs");
const { assert } = require("./forms_cli_common");

const report = JSON.parse(fs.readFileSync("artifacts/atkin_selected_lane_activation_report.json", "utf8"));

assert(report.report_id === "atkin_selected_lane_activation", "Wrong selected-lane activation report id");
assert(report.private_text_committed === false, "Selected lane report must not commit private text");
assert(report.generated_drafts_committed === false, "Selected lane report must not commit generated drafts");
assert(report.external_services_used === false, "Selected lane activation must not use external services");
assert(report.notebooklm_runtime_engine === false, "NotebookLM must not be runtime engine");
assert(report.notebooklm_is_authority === false, "NotebookLM must not be authority");
assert(report.real_templates_auto_activated === false, "Real Atkin templates must not be auto-activated");
assert(report.real_templates_required_status?.classificationStatus === "machine_candidate", "Real templates must remain machine candidates");
assert(report.real_templates_required_status?.reviewStatus === "lawyer_review_required", "Real templates must remain review-required");
assert(report.real_templates_required_status?.activeInRouting === false, "Real templates must remain inactive until review");

const lanes = report.lanes || [];
assert(lanes.length === 2, "Expected exactly two selected activation lanes");
for (const laneId of ["family_service", "company_winding_up_provisional_liquidator"]) {
  const lane = lanes.find(item => item.lane_id === laneId);
  assert(lane, `Missing selected lane ${laneId}`);
  assert(lane.activation_scope === "redacted_metadata_only", `${laneId}: activation must be redacted metadata only`);
  assert(lane.private_text_committed === false, `${laneId}: private text committed`);
  assert(lane.public_authority === false, `${laneId}: private forms must not be public authority`);
  assert(lane.real_templates_remain_inactive_until_review === true, `${laneId}: real candidates must remain inactive`);
  assert(lane.correct_stage_forms_route === true, `${laneId}: correct-stage route did not pass`);
  assert(lane.wrong_stage_forms_block === true, `${laneId}: wrong-stage block did not pass`);
  assert(lane.missing_facts_produce_blockers_or_placeholders === true, `${laneId}: missing-fact blocker did not pass`);
  assert(lane.private_semantic_retrieval_after_structured_filters === true, `${laneId}: private semantic retrieval order did not pass`);
  assert(lane.private_semantic_blocks_when_missing_fact === true, `${laneId}: missing fact did not block private semantic retrieval`);
  assert(lane.private_qdrant_dry_run_after_structured_filters === true, `${laneId}: private Qdrant dry-run gate did not pass`);
  assert(lane.private_qdrant_dry_run_blocks_before_semantic_on_missing_fact === true, `${laneId}: Qdrant missing-fact gate did not pass`);
  assert(lane.part2_document_flow_changes_with_facts === true, `${laneId}: Part 2 flow did not change with facts`);
  assert(lane.part3_timeline_crm_rows_generated === true, `${laneId}: Part 3 CRM rows not generated`);
}

console.log("atkin selected lane activation ok");
