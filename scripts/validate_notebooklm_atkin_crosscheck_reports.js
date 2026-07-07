#!/usr/bin/env node
const fs = require("fs");
const { assert } = require("./forms_cli_common");

for (const file of [
  "artifacts/notebooklm_atkin_framework_crosscheck_report.json",
  "artifacts/textbook_scenario_crosscheck_report.json",
]) {
  const report = JSON.parse(fs.readFileSync(file, "utf8"));
  assert(report.privacy_boundary?.internal_usage_note_only === true, `${file}: notes must be internal usage only`);
  assert(report.privacy_boundary?.notebooklm_runtime_engine === false, `${file}: NotebookLM cannot be runtime engine`);
  assert(report.privacy_boundary?.notebooklm_activates_templates === false, `${file}: NotebookLM cannot activate templates`);
  assert(report.privacy_boundary?.notebooklm_is_authority === false, `${file}: NotebookLM cannot be authority`);
  assert(report.privacy_boundary?.private_note_text_committed === false, `${file}: private note text must not be committed`);
  assert(report.privacy_boundary?.mismatches_auto_fixed === false, `${file}: mismatches must be report-only`);
  assert(Array.isArray(report.expectations) && report.expectations.length >= 1, `${file}: expectations missing`);
  assert(Array.isArray(report.backend_probes) && report.backend_probes.length >= 1, `${file}: backend probes missing`);
}
console.log("notebooklm atkin crosscheck reports ok");
