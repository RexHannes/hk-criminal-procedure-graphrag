#!/usr/bin/env node
const { buildStructuredCaseNotes, NOTES_PATH } = require("../src/case_graph/structured_case_notes");

const payload = buildStructuredCaseNotes({ write: true });
console.log(`structured case notes: ${payload.note_count}`);
console.log(`validation failures: ${payload.validation_failures.length}`);
for (const failure of payload.validation_failures.slice(0, 10)) {
  console.log(`  FAIL ${failure.case_id}: ${failure.errors.join(", ")}`);
}
console.log(`written: ${NOTES_PATH}`);
if (payload.validation_failures.length) process.exit(1);
