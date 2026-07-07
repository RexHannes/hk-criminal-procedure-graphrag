#!/usr/bin/env node
const fs = require("fs");
const { assert } = require("./forms_cli_common");

const files = [
  "artifacts/notebooklm_crosscheck_report.json",
  "artifacts/notebooklm_backend_comparison_report.json",
  "artifacts/forms_as_code_snippets_report.json",
];

for (const file of files) {
  assert(fs.existsSync(file), `Missing report ${file}`);
  const text = fs.readFileSync(file, "utf8");
  assert(/INTERNAL_USAGE_NOTE|internal/i.test(text), `${file}: NotebookLM internal-note boundary missing`);
  assert(!/"notebooklm_is_authority"\s*:\s*true/i.test(text), `${file}: NotebookLM incorrectly marked as authority`);
  assert(!/"notebooklm_runtime_engine"\s*:\s*true/i.test(text), `${file}: NotebookLM incorrectly marked as runtime engine`);
}

console.log("NotebookLM not authority ok");
