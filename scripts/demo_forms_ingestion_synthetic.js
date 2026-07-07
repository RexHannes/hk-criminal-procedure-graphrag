#!/usr/bin/env node
const { ensureSyntheticStore, writeDemoReport } = require("./forms_cli_common");

const store = ensureSyntheticStore();
const report = {
  status: "ok",
  source: "synthetic_fixture_only",
  privateStorePath: "fixtures/forms/synthetic_store",
  templatesExtracted: store.templates.length,
  clausesExtracted: store.clauses.length,
  usageRulesInferred: store.usageRules.length,
  notebooklmNotesLinked: store.notebooklmUsageNotes.length,
  provenanceLabels: Array.from(new Set([
    ...store.templates.map(t => t.provenanceLabel),
    ...store.clauses.map(c => c.provenanceLabel),
    ...store.notebooklmUsageNotes.map(n => n.provenanceLabel),
  ])),
};
writeDemoReport("forms_ingestion_synthetic", report);
console.log(JSON.stringify(report, null, 2));
