#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { assert } = require("./forms_cli_common");

const TARGETS = [
  "artifacts/private_form_lane_selection_report.json",
  "artifacts/private_form_lane_selection_report.md",
  "artifacts/private_form_review_activation_report.json",
  "artifacts/private_form_review_activation_report.md",
  "artifacts/private_notebooklm_usage_link_report.json",
  "artifacts/private_notebooklm_usage_link_report.md",
  "artifacts/private_lane_routing_fixtures_report.json",
  "artifacts/private_lane_routing_fixtures_report.md",
  "artifacts/private_lane_workflow_timeline_report.json",
  "artifacts/private_lane_workflow_timeline_report.md",
  "artifacts/private_lane_crm_export_preview.csv",
  "fixtures/forms/private_lane_company_winding_up_store/form_pack_manifest.json",
  "fixtures/forms/private_lane_company_winding_up_store/form_templates.json",
  "fixtures/forms/private_lane_company_winding_up_store/form_classification_reviews.json",
  "fixtures/forms/private_lane_company_winding_up_store/clause_snippets.json",
  "fixtures/forms/private_lane_company_winding_up_store/clause_usage_rules.json",
  "fixtures/forms/private_lane_company_winding_up_store/notebooklm_usage_notes.json",
  "fixtures/forms/private_lane_company_winding_up_store/form_routing_rules.json",
  "fixtures/forms/private_lane_company_winding_up_store/private_form_index.json",
];

const forbidden = [
  /Dear Sirs/i,
  /WITHOUT PREJUDICE/i,
  /\bAtkins\b/i,
  /Consultancy agreement/i,
  /shareholders.? agreement_/i,
  /formw\d/i,
  /\/Users\/puiyuenwong/i,
  /private_uploads\//i,
];

for (const file of TARGETS) {
  assert(fs.existsSync(file), `Expected private lane artifact missing: ${file}`);
  const text = fs.readFileSync(file, "utf8");
  for (const pattern of forbidden) {
    assert(!pattern.test(text), `${file} appears to contain private/source text marker ${pattern}`);
  }
  if (file.includes("fixtures/forms/private_lane_company_winding_up_store")) {
    assert(/redacted/i.test(text) || path.basename(file) === "notebooklm_usage_notes.json" || path.basename(file) === "clause_usage_rules.json" || path.basename(file) === "form_routing_rules.json", `${file} should clearly be redacted metadata`);
  }
}

const trackedPrivate = require("child_process")
  .execFileSync("git", ["ls-files", "private_uploads", "private_ingest_output", "private_notebooklm_notes"], { encoding: "utf8" })
  .trim();
assert(!trackedPrivate, "Private input/output directories must not be tracked");

console.log("private lane no text leakage ok");
