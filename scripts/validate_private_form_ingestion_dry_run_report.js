#!/usr/bin/env node
const fs = require("fs");
const { assert } = require("./forms_cli_common");

const report = JSON.parse(fs.readFileSync("artifacts/private_form_ingestion_dry_run_report.json", "utf8"));
const md = fs.readFileSync("artifacts/private_form_ingestion_dry_run_report.md", "utf8");

assert(report.privacy_boundary?.metadata_only_report === true, "Dry-run report must be metadata-only");
assert(report.privacy_boundary?.committed_private_text === false, "Dry-run report must not commit private text");
assert(report.privacy_boundary?.external_services_used === false, "Dry-run must not use external services");
assert(report.privacy_boundary?.private_output_dir === "private_ingest_output/", "Private output dir must be gitignored private_ingest_output/");
assert(Array.isArray(report.pack_summaries), "Dry-run report must include pack summaries");
assert(report.totals.templates_inactive_until_review === true, "Private dry-run templates must be inactive until review");
assert(md.includes("metadata only"), "Markdown report must state metadata-only boundary");
assert(!/PRIVATE FORM TEXT|Dear Sirs|WITHOUT PREJUDICE|Atkins/i.test(md), "Markdown report appears to contain private/form text");

console.log("private form ingestion dry-run report ok");
