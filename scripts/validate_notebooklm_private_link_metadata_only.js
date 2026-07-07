#!/usr/bin/env node
const fs = require("fs");
const { assert } = require("./forms_cli_common");

const report = JSON.parse(fs.readFileSync("artifacts/private_notebooklm_usage_link_report.json", "utf8"));
const md = fs.readFileSync("artifacts/private_notebooklm_usage_link_report.md", "utf8");

assert(report.selected_lane === "company_winding_up", "NotebookLM private link report must target selected lane");
assert(report.notebooklm_is_authority === false, "NotebookLM/internal notes must not be treated as authority");
assert(report.provenance_label === "INTERNAL_USAGE_NOTE", "NotebookLM/internal notes must stay INTERNAL_USAGE_NOTE");
assert(report.committed_note_text === false, "NotebookLM private note text must not be committed");
assert(["no_private_notebooklm_notes_found", "private_notes_available_not_committed"].includes(report.status), "Unexpected NotebookLM private link status");
if (report.notes_count === 0) {
  assert(report.note_template_link_status === "unavailable", "No notes should mean unavailable template links");
  assert(report.note_clause_link_status === "unavailable", "No notes should mean unavailable clause links");
} else {
  assert(/candidate/.test(report.note_template_link_status), "Private NotebookLM template links must remain candidate/private-only");
  assert(/candidate/.test(report.note_clause_link_status), "Private NotebookLM clause links must remain candidate/private-only");
}
assert(!/Dear Sirs|WITHOUT PREJUDICE|Atkins/i.test(md), "NotebookLM metadata report appears to contain private text");

console.log("NotebookLM private link metadata-only ok");
