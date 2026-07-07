#!/usr/bin/env node
const fs = require("fs");
const { assert } = require("./forms_cli_common");

const report = JSON.parse(fs.readFileSync("artifacts/private_forms_context_awareness_eval_report.json", "utf8"));
assert(report.private_text_committed === false, "Context eval must not commit private text");
assert(report.external_services_used === false, "Context eval must not use external services");
assert(report.notebooklm_runtime_engine === false, "NotebookLM must not be runtime engine");
assert(report.structured_filters_before_qdrant_semantic === true, "Structured filters must run before Qdrant semantic retrieval");
assert(report.vector_cannot_override_structured_blockers === true, "Vector retrieval cannot override blockers");
assert(report.failed_count === 0, "Context-awareness eval has failed cases");
for (const id of [
  "correct_lane_stage_intent_role_allows_private_qdrant_gate",
  "wrong_stage_blocks_before_semantic",
  "missing_fact_blocks_clause_semantic_return",
  "consent_route_suggests_alternative_not_new_writ",
]) {
  assert((report.cases || []).some(item => item.id === id && item.passed === true), `Missing passed context case ${id}`);
}
console.log("private forms context awareness eval ok");
