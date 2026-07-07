#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { loadFormStore, writeJson } = require("../src/forms/form_system");
const { buildPrivateFormBackendIndex } = require("../src/forms/private_form_backend_index");
const { recallPrivateForms } = require("../src/forms/private_form_recall");
const { buildPart2DocumentAdvice } = require("../src/advice/part2_document_advice");
const { composeWorkflowTimeline } = require("../src/advice/workflow_timeline_composer");
const { crmRowsToCsv } = require("../src/advice/crm_export_composer");

const ARTIFACTS = path.join(process.cwd(), "artifacts");
const STORE = "fixtures/forms/private_lane_company_winding_up_store";

const matter = {
  firmId: "private-lane-pilot-firm",
  workspaceId: "company-winding-up-pilot",
  practiceArea: "company_corporate",
  practiceLane: "company_winding_up",
  matterType: "company_winding_up",
  workflowStage: "COMPANY_WINDING_UP",
  clientRole: "creditor",
  companyIdentified: true,
  debtOrGroundIdentified: true,
  standingChecked: true,
  statutoryDemandOrServiceEvidenceAvailable: false,
};

function mdTable(rows) {
  return rows.map(([k, v]) => `| ${k} | ${v} |`).join("\n");
}

function writeMd(name, title, generatedAt, body) {
  fs.writeFileSync(path.join(ARTIFACTS, `${name}.md`), `# ${title}\n\nGenerated: ${generatedAt}\n\n${body}\n`);
}

function run() {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  const generatedAt = "2026-07-07T00:00:00+08:00";
  const dryRun = JSON.parse(fs.readFileSync(path.join(ARTIFACTS, "private_form_ingestion_dry_run_report.json"), "utf8"));
  const store = loadFormStore(STORE);
  const backendIndex = buildPrivateFormBackendIndex(store);
  const recall = recallPrivateForms({
    store,
    matter,
    query: "draft company winding-up petition but statutory demand service evidence is missing",
    documentIntent: "COMPANY_WINDING_UP_PETITION",
    workflowStage: "COMPANY_WINDING_UP",
  });
  const part2 = buildPart2DocumentAdvice({
    store,
    matter,
    query: "draft company winding-up petition but statutory demand service evidence is missing",
    documentIntent: "COMPANY_WINDING_UP_PETITION",
    workflowStage: "COMPANY_WINDING_UP",
  });
  const part3 = composeWorkflowTimeline({
    part1LegalAnalysis: { status: "research_required" },
    documentaryFlow: part2.documentaryFlow,
  });

  const courtDropzone = {
    report_id: "court_form_dropzone",
    generated_at: generatedAt,
    status: "contract_ready_existing_private_dry_run_metadata",
    dropzone_script: "scripts/ingest_court_form_dropzone.js",
    expected_input: "private_uploads/court_forms/",
    expected_output: "private_ingest_output/<workspace>/",
    private_text_committed: false,
    external_services_used: false,
    packs_processed_from_existing_dry_run: dryRun.packs_processed,
    templates_detected_from_existing_dry_run: dryRun.totals.templates_detected,
    clauses_detected_from_existing_dry_run: dryRun.totals.clauses_detected,
    review_queue_count_from_existing_dry_run: dryRun.totals.classification_reviews_created,
    workflow_indexes: [
      "matter_document_flow_index.json",
      "workflow_timeline_rules.json"
    ],
    lane_distribution: dryRun.pack_summaries.reduce((acc, pack) => {
      Object.entries(pack.practice_area_distribution || {}).forEach(([lane, count]) => {
        acc[lane] = (acc[lane] || 0) + count;
      });
      return acc;
    }, {}),
  };
  writeJson(path.join(ARTIFACTS, "court_form_dropzone_report.json"), courtDropzone);
  writeMd("court_form_dropzone_report", "Court Form Dropzone Report", generatedAt, `## Summary\n\n| Metric | Count |\n|---|---:|\n${mdTable([
    ["Existing private packs processed", courtDropzone.packs_processed_from_existing_dry_run],
    ["Templates detected", courtDropzone.templates_detected_from_existing_dry_run],
    ["Clause-like segments", courtDropzone.clauses_detected_from_existing_dry_run],
    ["Review queue records", courtDropzone.review_queue_count_from_existing_dry_run],
  ])}\n\nDropzone script: \`${courtDropzone.dropzone_script}\`\n\nPrivate text committed: no.\n`);

  const recallReport = {
    report_id: "private_form_backend_recall",
    generated_at: generatedAt,
    private_text_committed: false,
    public_authority: false,
    reviewed_only: true,
    store: STORE,
    index_stats: recall.indexStats,
    recommended_count: recall.recommended.length,
    blocked_count: recall.blocked.length,
    missing_facts: recall.missingFacts,
    required_evidence: recall.requiredEvidence,
    backend_index_records: backendIndex.formIndex.records.length,
    matter_document_flow_records: backendIndex.matterDocumentFlowIndex.flows.length,
    workflow_timeline_rules: backendIndex.workflowTimelineRules.rules.length,
  };
  writeJson(path.join(ARTIFACTS, "private_form_backend_recall_report.json"), recallReport);
  writeMd("private_form_backend_recall_report", "Private Form Backend Recall Report", generatedAt, `Reviewed-only recall for \`company_winding_up\`.\n\n| Metric | Count |\n|---|---:|\n${mdTable([
    ["Recommended documents", recallReport.recommended_count],
    ["Blocked documents", recallReport.blocked_count],
    ["Backend index records", recallReport.backend_index_records],
    ["Matter document flows", recallReport.matter_document_flow_records],
    ["Workflow timeline rules", recallReport.workflow_timeline_rules],
  ])}\n\nMissing facts/evidence: ${[...recallReport.missing_facts, ...recallReport.required_evidence].join(", ") || "none"}.\n\nPrivate text committed: no.\n`);

  const part2Report = {
    report_id: "part2_documentary_flow",
    generated_at: generatedAt,
    private_text_committed: false,
    part2: part2.documentaryFlow,
    recommended_count: part2.documentaryFlow.recommendedDocuments.length,
    blocked_count: part2.documentaryFlow.blockedDocuments.length,
    placeholder_only_count: part2.documentaryFlow.placeholderOnlyDocuments.length,
    missing_crucial_information_count: part2.documentaryFlow.missingCrucialInformation.length,
    required_evidence_count: part2.documentaryFlow.requiredEvidence.length,
  };
  writeJson(path.join(ARTIFACTS, "part2_documentary_flow_report.json"), part2Report);
  writeMd("part2_documentary_flow_report", "Part 2 Documentary Flow Report", generatedAt, `| Metric | Count |\n|---|---:|\n${mdTable([
    ["Recommended documents", part2Report.recommended_count],
    ["Blocked documents", part2Report.blocked_count],
    ["Placeholder-only documents", part2Report.placeholder_only_count],
    ["Missing crucial information", part2Report.missing_crucial_information_count],
    ["Required evidence", part2Report.required_evidence_count],
  ])}\n\nPublic legal analysis remains separate. Private text committed: no.\n`);

  const part3Report = {
    report_id: "part3_workflow_timeline",
    generated_at: generatedAt,
    private_text_committed: false,
    professional_advice_certified: false,
    timeline: part3.timeline,
    row_count: part3.timeline.length,
  };
  writeJson(path.join(ARTIFACTS, "part3_workflow_timeline_report.json"), part3Report);
  fs.writeFileSync(path.join(ARTIFACTS, "private_lane_crm_export_preview.csv"), crmRowsToCsv(part3.timeline));
  writeMd("part3_workflow_timeline_report", "Part 3 Workflow Timeline Report", generatedAt, `CRM rows: ${part3Report.row_count}\n\nPrivate text committed: no.\n`);

  console.log(JSON.stringify({
    courtDropzone: courtDropzone.status,
    recallRecommended: recallReport.recommended_count,
    part2Recommended: part2Report.recommended_count,
    timelineRows: part3Report.row_count,
  }, null, 2));
}

if (require.main === module) run();
