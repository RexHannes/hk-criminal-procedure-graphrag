#!/usr/bin/env node
const { ingestPrivateFormPack, parseArgs } = require("./forms_cli_common");

const args = parseArgs();
const result = ingestPrivateFormPack({
  input: args.input,
  firm: args.firm,
  workspace: args.workspace,
  sourcePack: args.sourcePack,
  licenseNote: args.licenseNote,
  notebooklmNotes: args.notebooklmNotes,
  output: args.output,
  uploadedBy: args.uploadedBy || "local-user",
});

console.log(JSON.stringify({
  status: "ok",
  privateStorePath: result.privateStorePath,
  templates: result.templates.length,
  clauses: result.clauses.length,
  usageRules: result.usageRules.length,
  notebooklmUsageNotes: result.notebooklmUsageNotes.length,
}, null, 2));
