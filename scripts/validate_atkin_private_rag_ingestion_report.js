#!/usr/bin/env node
const fs = require("fs");
const { assert } = require("./forms_cli_common");

const report = JSON.parse(fs.readFileSync("artifacts/atkin_private_rag_ingestion_report.json", "utf8"));
assert(report.report_id === "atkin_private_rag_ingestion", "Wrong ingestion report id");
assert(report.privacy_boundary?.committed_private_text === false, "Ingestion report must be metadata-only");
assert(report.privacy_boundary?.external_services_used === false, "Private ingestion must not use external services");
assert(report.privacy_boundary?.notebooklm_runtime_engine === false, "NotebookLM must not be runtime engine");
assert(report.privacy_boundary?.notebooklm_provenance === "INTERNAL_USAGE_NOTE", "NotebookLM must remain internal usage note");
assert(report.privacy_boundary?.input_root === "private_uploads/atkin_forms/", "Atkin input root must be gitignored private path");
assert(report.privacy_boundary?.output_root === "private_ingest_output/atkin_forms/", "Atkin output root must be gitignored private path");
for (const pack of report.pack_summaries || []) {
  assert(pack.private_text_committed === false, "Pack summary must not commit private text");
  assert(pack.inactive_until_review === true, "Real private Atkin templates must remain inactive until review");
  assert(!Object.prototype.hasOwnProperty.call(pack, "raw_text"), "Pack summary must not include raw text");
}
console.log("atkin private rag ingestion report ok");
