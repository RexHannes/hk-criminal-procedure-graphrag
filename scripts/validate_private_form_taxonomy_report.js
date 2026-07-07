#!/usr/bin/env node
const fs = require("fs");
const { assert } = require("./forms_cli_common");

const report = JSON.parse(fs.readFileSync("artifacts/private_form_ingestion_dry_run_report.json", "utf8"));
const md = fs.readFileSync("artifacts/private_form_ingestion_dry_run_report.md", "utf8");

assert(["completed", "completed_with_errors"].includes(report.status), "Expected a completed local/private dry-run metadata report");
assert(report.privacy_boundary?.metadata_only_report === true, "Private dry-run taxonomy report must be metadata-only");
assert(report.privacy_boundary?.committed_private_text === false, "Private dry-run taxonomy report must not commit private text");
assert(report.privacy_boundary?.external_services_used === false, "Private dry-run must not use external services");
assert(report.packs_processed >= 4, "Expected Sem B/Downloads dry run to process multiple packs");
assert(report.totals.templates_detected >= 10, "Expected dry run to detect a meaningful template sample");
assert(report.totals.classification_reviews_created === report.totals.templates_detected, "Every detected template must have a classification review");
assert(report.totals.templates_inactive_until_review === true, "Real/private templates must remain inactive until review");
assert(report.totals.percentage_requiring_manual_classification === 100, "All real/private classifications must require manual review");

const packs = report.pack_summaries || [];
const intents = new Set();
const practices = new Set();
for (const pack of packs) {
  assert(/^private_ingest_output\//.test(pack.private_output_dir || ""), "Pack output path must be gitignored private_ingest_output/");
  assert(pack.titles_redacted_by_default === true, "Candidate titles must remain redacted by default");
  assert((pack.candidate_template_titles || []).length === 0, "Candidate titles must not be committed by default");
  Object.keys(pack.document_intent_distribution || {}).forEach(intent => intents.add(intent));
  Object.keys(pack.practice_area_distribution || {}).forEach(area => practices.add(area));
}

assert(practices.has("probate"), "Dry run should include a probate practice bucket");
assert(practices.has("commercial_contracts"), "Dry run should include a commercial contracts practice bucket");
assert(practices.has("company_corporate"), "Dry run should include a company/corporate practice bucket");
assert(practices.has("financial_regulatory"), "Dry run should include a financial/regulatory practice bucket");
assert(intents.has("PROBATE_APPLICATION") || intents.has("PROBATE_AFFIDAVIT"), "Dry run should classify probate forms");
assert(["CONTRACT_AGREEMENT", "CONTRACT_CLAUSE", "LEASE_AGREEMENT", "SHAREHOLDERS_AGREEMENT"].some(intent => intents.has(intent)), "Dry run should classify contract/document drafting forms");
assert(["COMPANY_WINDING_UP_PETITION", "COMPANY_COMPLIANCE_MEMO", "ORIGINATING_SUMMONS"].some(intent => intents.has(intent)), "Dry run should classify company/corporate forms");
assert(intents.has("REGULATORY_COMPLIANCE_NOTE"), "Dry run should classify financial/regulatory materials");
assert(!/Dear Sirs|WITHOUT PREJUDICE|PRIVATE FORM TEXT/i.test(md), "Dry-run markdown appears to contain private form text");

console.log("private form taxonomy dry-run report ok");
