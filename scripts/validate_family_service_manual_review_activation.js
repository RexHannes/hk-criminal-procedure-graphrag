#!/usr/bin/env node
const fs = require("fs");
const { assert } = require("./forms_cli_common");
const { loadFormStore, routeForms } = require("../src/forms/form_system");
const { recallPrivateForms } = require("../src/forms/private_form_recall");

const REPORT = "artifacts/family_service_manual_review_activation_report.json";
const STORE_DIR = "private_ingest_output/atkin_forms/_family_service_manual_review_approved_metadata";
const QDRANT_REPORT = "artifacts/atkin_private_qdrant_index_report.json";

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function blob(value) {
  return JSON.stringify(value || {});
}

assert(fs.existsSync(REPORT), "Family service manual review report missing");
assert(fs.existsSync(`${STORE_DIR}/form_templates.json`), "Activated private family-service metadata store missing");
const report = readJson(REPORT);
const qdrant = readJson(QDRANT_REPORT);
const text = fs.readFileSync(REPORT, "utf8");

assert(report.report_id === "family_service_manual_review_activation", "Wrong family-service report id");
assert(report.lane === "family_service", "Report must be scoped to family_service only");
assert(report.privacy_boundary?.private_text_committed === false, "Private text must not be committed");
assert(report.privacy_boundary?.generated_drafts_committed === false, "Generated drafts must not be committed");
assert(report.privacy_boundary?.external_services_used === false, "External services must not be used");
assert(report.privacy_boundary?.raw_titles_committed === false, "Raw titles must not be committed");
assert(report.privacy_boundary?.raw_template_text_committed === false, "Raw template text must not be committed");
assert(report.privacy_boundary?.notebooklm_runtime_engine === false, "NotebookLM must not be runtime engine");
assert(report.candidates_reviewed_count >= 10 && report.candidates_reviewed_count <= 20, "Expected 10-20 family-service candidates reviewed");
assert(report.approved_metadata_templates >= 3 && report.approved_metadata_templates <= 5, "Expected 3-5 approved metadata templates");
assert(report.approved_redacted_clause_chunks > 0, "Expected approved redacted clause chunks");
assert(Object.keys(report.classifier_drift_summary || {}).some(key => /company|commercial|probate|practice_area_not_family/.test(key)), "Classifier drift flags missing");
assert(!/"title"\s*:/i.test(text), "Report must not include raw title fields");
assert(!/Dear Sirs|WITHOUT PREJUDICE|\bAtkins\b|Consultancy agreement|formw\d|\/Users\/puiyuenwong/i.test(text), "Report appears to contain private text marker");

const store = loadFormStore(STORE_DIR);
assert(store.templates.length === report.approved_metadata_templates, "Store/report approved template count mismatch");
assert(store.templates.every(template => template.reviewStatus === "approved" && template.classificationStatus === "review_approved"), "Approved store templates must be review-approved");
assert(store.templates.every(template => template.practiceArea === "family_service" && template.proceduralStage === "FAMILY_SERVICE"), "Approved store templates must be corrected to family service stage");
assert(store.clauses.every(clause => clause.reviewStatus === "approved" && !/Dear Sirs|WITHOUT PREJUDICE|\bAtkins\b|Consultancy agreement|formw\d/i.test(blob(clause))), "Approved clause metadata must be redacted and approved");

const firstIntent = store.templates[0].documentIntent;
const readyMatter = {
  firmId: "local-private-form-tenant",
  workspaceId: "atkin-forms-workspace",
  practiceArea: "family_service",
  practiceLane: "family_service",
  matterType: "family_service",
  workflowStage: "FAMILY_SERVICE",
  clientRole: "applicant",
  proceedingsIssued: true,
  respondentIdentified: true,
  serviceAddressKnown: true,
  serviceMethodSelected: true,
  serviceAttemptEvidenceAvailable: true,
};

function route(label, patch, documentIntent = firstIntent, workflowStage = "FAMILY_SERVICE") {
  return routeForms({
    store,
    matter: { ...readyMatter, ...patch },
    query: `${label} family service document route`,
    documentIntent,
    workflowStage,
  });
}

const correct = route("correct-stage", {});
assert(correct.recommendedForms.length >= 1, "Correct family-service stage should route approved metadata forms");
assert(correct.applicableClauses.length >= 1, "Correct family-service stage should expose applicable redacted clauses");

for (const [label, patch] of [
  ["answer-stage", { answerStage: true }],
  ["trial-stage", { trialStage: true }],
  ["post-trial-stage", { postTrialStage: true }],
  ["already-served", { respondentAlreadyServed: true }],
]) {
  const result = route(label, patch);
  assert(result.recommendedForms.length === 0, `${label} must not recommend fresh service forms`);
  assert(result.blockedForms.length >= 1, `${label} must produce blocked family-service forms`);
}

const missingAddress = route("missing-address", { serviceAddressKnown: false });
assert(missingAddress.recommendedForms.length >= 1, "Missing address may route only as placeholder/blocker");
assert((missingAddress.missingFacts || []).includes("serviceAddressKnown") || (missingAddress.requiredEvidence || []).includes("serviceAddressKnown"), "Missing respondent address must be surfaced");
const missingRecall = recallPrivateForms({
  store,
  matter: { ...readyMatter, serviceAddressKnown: false },
  query: "family service with missing respondent address",
  documentIntent: firstIntent,
  workflowStage: "FAMILY_SERVICE",
});
assert(missingRecall.semanticClauseRetrieval.semanticExecuted === false, "Missing respondent address must block private semantic retrieval");
assert(missingRecall.semanticClauseRetrieval.indexStats.returnedChunks === 0, "Missing respondent address must not return private chunks");

const legalOnly = routeForms({
  store,
  matter: {},
  query: "explain the legal principles for child welfare and matrimonial jurisdiction",
});
assert(legalOnly.recommendedForms.length === 0, "Public legal-analysis-only query must not retrieve private forms");

assert(qdrant.templates_ready > 0, "Private Qdrant dry-run should see approved family-service templates after manual review");
assert(qdrant.chunks_ready > 0, "Private Qdrant dry-run should see approved family-service chunks after manual review");

console.log("family service manual review activation ok");
