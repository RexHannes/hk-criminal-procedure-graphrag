#!/usr/bin/env node
const fs = require("fs");
const { assert } = require("./forms_cli_common");

const report = JSON.parse(fs.readFileSync("artifacts/notebooklm_backend_comparison_report.json", "utf8"));
assert(report.private_note_text_committed === false, "Backend comparison must not commit NotebookLM note text");
assert(report.notebooklm_is_authority === false, "NotebookLM comparison must not treat notes as authority");
assert(report.notebooklm_overrides_review_gates === false, "NotebookLM must not override review gates");
assert(report.mismatches_auto_fixed === false, "Mismatches must be reported, not auto-fixed");
assert(report.compared_count >= 1, "Expected at least one backend comparison");
for (const item of report.comparisons) {
  assert(item.notebooklmIsAuthority === false, `${item.scenarioId}: NotebookLM treated as authority`);
  assert(item.notebooklmOverridesReviewGates === false, `${item.scenarioId}: NotebookLM overrides review gates`);
  assert(item.publicAuthority === false, `${item.scenarioId}: private forms polluted public authority`);
  assert(Array.isArray(item.mismatches), `${item.scenarioId}: mismatches must be explicit`);
}
console.log("backend against NotebookLM expected forms ok");
