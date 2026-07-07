#!/usr/bin/env node
const fs = require("fs");
const { execFileSync } = require("child_process");
const { assert } = require("./forms_cli_common");

const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
for (const forbiddenPath of ["private_uploads/", "private_ingest_output/", "private_notebooklm_notes/", "private_exports/"]) {
  assert(!tracked.some(file => file.startsWith(forbiddenPath)), `${forbiddenPath} must not be tracked`);
}
const reportFiles = tracked.filter(file => /^artifacts\/(atkin_private|notebooklm_atkin|textbook_scenario|private_forms_context_awareness)/.test(file));
for (const file of reportFiles) {
  const text = fs.readFileSync(file, "utf8");
  assert(!/Dear Sirs|WITHOUT PREJUDICE|\bAtkins\b|formw\d|Consultancy agreement|\/Users\/puiyuenwong/i.test(text), `${file} appears to contain private text marker`);
  assert(!/"raw_text"\s*:/i.test(text), `${file} must not include raw_text fields`);
}
console.log("no raw atkin text committed ok");
