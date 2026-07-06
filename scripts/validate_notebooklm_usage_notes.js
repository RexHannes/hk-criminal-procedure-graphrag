#!/usr/bin/env node
const { assert, loadSyntheticStore } = require("./forms_cli_common");

const store = loadSyntheticStore();
assert(store.notebooklmUsageNotes.length >= 1, "Expected at least one NotebookLM usage note fixture");
assert(store.notebooklmUsageNotes.every(n => n.provenanceLabel === "INTERNAL_USAGE_NOTE"), "NotebookLM notes must be INTERNAL_USAGE_NOTE");
assert(store.notebooklmUsageNotes.some(n => (n.relatedClauseIds || []).length), "Expected notes linked to clauses");
console.log("notebooklm usage notes ok");
