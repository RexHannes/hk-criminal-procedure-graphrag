#!/usr/bin/env node
const fs = require("fs");
const { assert } = require("./forms_cli_common");

const report = JSON.parse(fs.readFileSync("artifacts/court_form_dropzone_report.json", "utf8"));
assert(fs.existsSync("scripts/ingest_court_form_dropzone.js"), "Dropzone script missing");
assert(fs.existsSync("src/forms/court_form_dropzone.js"), "Dropzone module missing");
assert(report.private_text_committed === false, "Dropzone report must be metadata only");
assert(report.external_services_used === false, "Dropzone must not use external services");
assert(report.expected_input === "private_uploads/court_forms/", "Dropzone expected input mismatch");
assert(report.workflow_indexes.includes("matter_document_flow_index.json"), "Dropzone must create matter document flow index");
assert(report.workflow_indexes.includes("workflow_timeline_rules.json"), "Dropzone must create workflow timeline rules");
assert(report.templates_detected_from_existing_dry_run >= 1, "Dropzone report should reflect existing private dry run metadata");
console.log("court form dropzone ingestion contract ok");
