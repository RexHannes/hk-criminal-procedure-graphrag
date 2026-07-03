#!/usr/bin/env node
/**
 * Validator: every structured case note must
 *  - satisfy the case-note schema (issue/holding/principle/application present),
 *  - carry paragraph proof where every quote is a substring of paragraph text,
 *  - carry paragraph support ids for every filled analytic statement,
 *  - cover every case in the viewer evidence index (no orphan authorities).
 */
const { loadStructuredCaseNotes } = require("../src/case_graph/structured_case_notes");
const { validateCaseNote } = require("../src/case_graph/case_note_schema");
const { loadViewerEvidenceIndex } = require("../src/case_graph/verified_case_authority");

const errors = [];
const payload = loadStructuredCaseNotes({ refresh: false });
const notes = payload.notes || [];
if (!notes.length) errors.push("no_case_notes");

const noteCaseIds = new Set(notes.map(n => n.case_id));
for (const note of notes) {
  const check = validateCaseNote(note);
  if (!check.ok) {
    errors.push(`invalid_note:${note.case_id}:${check.errors.join("|")}`);
  }
}

const index = loadViewerEvidenceIndex();
const indexCaseIds = new Set((index.records || []).map(r => r.case_id || r.case_name));
for (const caseId of indexCaseIds) {
  if (!noteCaseIds.has(caseId)) errors.push(`visible_case_without_note:${caseId}`);
}

if (errors.length) {
  console.error("validate_structured_case_notes: FAIL");
  for (const err of errors.slice(0, 20)) console.error(`  - ${err}`);
  process.exit(1);
}
console.log(`validate_structured_case_notes: PASS (${notes.length} notes, ${indexCaseIds.size} visible cases covered)`);
