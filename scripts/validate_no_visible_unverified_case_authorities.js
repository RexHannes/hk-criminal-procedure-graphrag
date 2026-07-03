#!/usr/bin/env node
const { auditBackendSearchable } = require("../src/case_graph/case_authority_eval");

const audit = auditBackendSearchable();
if (audit.visible_unverified > 0 || audit.backend_searchable_unverified > 0) {
  console.error(JSON.stringify({ ok: false, ...audit }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, ...audit }, null, 2));
