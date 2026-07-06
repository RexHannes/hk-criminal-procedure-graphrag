#!/usr/bin/env node
const { assert, loadSyntheticStore } = require("./forms_cli_common");

const store = loadSyntheticStore();
assert(store.notebooklmUsageNotes.length >= 1, "Expected NotebookLM/internal notes fixture");

for (const note of store.notebooklmUsageNotes) {
  assert(note.provenanceLabel === "INTERNAL_USAGE_NOTE", `${note.id}: note must be internal usage note only`);
  assert(note.note_template_link_status === "candidate", `${note.id}: template link status must default candidate`);
  assert(note.note_clause_link_status === "candidate", `${note.id}: clause link status must default candidate`);
  for (const link of note.templateLinks || []) {
    assert(link.note_template_link_status === "candidate", `${note.id}: template link ${link.templateId} must be candidate`);
  }
  for (const link of note.clauseLinks || []) {
    assert(link.note_clause_link_status === "candidate", `${note.id}: clause link ${link.clauseId} must be candidate`);
  }
}

for (const clause of store.clauses) {
  for (const link of clause.notebooklmUsageLinks || []) {
    assert(link.note_clause_link_status === "candidate", `${clause.id}: NotebookLM clause link must be candidate`);
  }
}

console.log("NotebookLM links candidate until reviewed ok");
