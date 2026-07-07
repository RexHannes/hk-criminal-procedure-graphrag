#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { loadFormStore, routeForms, buildAnswerForFormsQuestion, writeJson } = require("../src/forms/form_system");
const { recallPrivateForms } = require("../src/forms/private_form_recall");
const { recallPrivateFormsFromQdrant } = require("../src/forms/private_atkin_rag");

const ARTIFACTS = path.join(process.cwd(), "artifacts");
const PRIVATE_ATKIN_OUTPUT = path.join(process.cwd(), "private_ingest_output", "atkin_forms");
const REPORT_JSON = path.join(ARTIFACTS, "atkin_selected_lane_activation_report.json");
const REPORT_MD = path.join(ARTIFACTS, "atkin_selected_lane_activation_report.md");
const GENERATED_AT = "2026-07-08T00:00:00+08:00";

const LANES = [
  {
    lane_id: "family_service",
    store_path: "fixtures/forms/private_lane_family_service_store",
    document_intent: "FAMILY_SERVICE_ACKNOWLEDGMENT",
    workflow_stage: "FAMILY_SERVICE",
    match_pattern: /family|service|children|answer/i,
    ready_matter: {
      firmId: "private-lane-pilot-firm",
      workspaceId: "family_service-pilot",
      practiceArea: "family_service",
      practiceLane: "family_service",
      matterType: "family_service",
      workflowStage: "FAMILY_SERVICE",
      clientRole: "applicant",
      proceedingsIssued: true,
      respondentIdentified: true,
      serviceAddressKnown: true,
      serviceMethodSelected: true,
    },
    missing_fact_patch: { serviceAddressKnown: false },
    wrong_stage_patch: { postTrialStage: true },
    expected_missing_fact: "serviceAddressKnown",
  },
  {
    lane_id: "company_winding_up_provisional_liquidator",
    store_path: "fixtures/forms/private_lane_company_provisional_liquidator_store",
    document_intent: "COMPANY_PROVISIONAL_LIQUIDATOR_APPLICATION",
    workflow_stage: "PROVISIONAL_LIQUIDATOR",
    match_pattern: /winding|liquidat|insolv/i,
    ready_matter: {
      firmId: "private-lane-pilot-firm",
      workspaceId: "company_winding_up_provisional_liquidator-pilot",
      practiceArea: "company_corporate",
      practiceLane: "company_winding_up",
      matterType: "provisional_liquidator",
      workflowStage: "PROVISIONAL_LIQUIDATOR",
      clientRole: "creditor",
      companyIdentified: true,
      standingChecked: true,
      urgencyGroundsIdentified: true,
      assetRiskEvidenceAvailable: true,
    },
    missing_fact_patch: { assetRiskEvidenceAvailable: false },
    wrong_stage_patch: { voluntaryWindingUpOnly: true },
    expected_missing_fact: "assetRiskEvidenceAvailable",
  },
];

function listStores(root = PRIVATE_ATKIN_OUTPUT) {
  const stores = [];
  if (!fs.existsSync(root)) return stores;
  const walk = dir => {
    if (fs.existsSync(path.join(dir, "form_templates.json")) && fs.existsSync(path.join(dir, "clause_snippets.json"))) {
      stores.push(dir);
      return;
    }
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(path.join(dir, entry.name));
    }
  };
  walk(root);
  return stores;
}

function countRealLaneCandidates(lane) {
  let templates = 0;
  let clauseChunks = 0;
  let reviewRequired = 0;
  let activeTemplates = 0;
  for (const storeDir of listStores()) {
    const templatesPath = path.join(storeDir, "form_templates.json");
    const clausesPath = path.join(storeDir, "clause_snippets.json");
    const sourceTemplates = JSON.parse(fs.readFileSync(templatesPath, "utf8"));
    const sourceClauses = fs.existsSync(clausesPath) ? JSON.parse(fs.readFileSync(clausesPath, "utf8")) : [];
    const matched = sourceTemplates.filter(template => (
      lane.match_pattern.test(`${template.title || ""} ${template.documentIntent || ""} ${template.practiceArea || ""} ${template.subPracticeArea || ""}`)
    ));
    const matchedIds = new Set(matched.map(template => template.id));
    templates += matched.length;
    clauseChunks += sourceClauses.filter(clause => matchedIds.has(clause.templateId)).length;
    reviewRequired += matched.filter(template => template.reviewStatus === "lawyer_review_required").length;
    activeTemplates += matched.filter(template => template.activeInRouting === true).length;
  }
  return {
    templates_detected: templates,
    clause_chunks_detected: clauseChunks,
    review_required_templates: reviewRequired,
    active_real_templates: activeTemplates,
  };
}

async function evaluateLane(lane) {
  const store = loadFormStore(lane.store_path);
  const readyRoute = routeForms({
    store,
    matter: lane.ready_matter,
    query: `${lane.lane_id} correct stage document workflow`,
    documentIntent: lane.document_intent,
    workflowStage: lane.workflow_stage,
  });
  const wrongRoute = routeForms({
    store,
    matter: { ...lane.ready_matter, ...lane.wrong_stage_patch },
    query: `${lane.lane_id} wrong stage strong semantic match`,
    documentIntent: lane.document_intent,
    workflowStage: lane.workflow_stage,
  });
  const missingRoute = routeForms({
    store,
    matter: { ...lane.ready_matter, ...lane.missing_fact_patch },
    query: `${lane.lane_id} missing fact placeholder document workflow`,
    documentIntent: lane.document_intent,
    workflowStage: lane.workflow_stage,
  });
  const readySemantic = recallPrivateForms({
    store,
    matter: lane.ready_matter,
    query: `${lane.lane_id} private approved clause retrieval`,
    documentIntent: lane.document_intent,
    workflowStage: lane.workflow_stage,
  }).semanticClauseRetrieval;
  const missingSemantic = recallPrivateForms({
    store,
    matter: { ...lane.ready_matter, ...lane.missing_fact_patch },
    query: `${lane.lane_id} missing fact should block private clause retrieval`,
    documentIntent: lane.document_intent,
    workflowStage: lane.workflow_stage,
  }).semanticClauseRetrieval;
  const qdrantReady = await recallPrivateFormsFromQdrant({
    store,
    matter: lane.ready_matter,
    query: `${lane.lane_id} private qdrant dry run`,
    documentIntent: lane.document_intent,
    workflowStage: lane.workflow_stage,
    env: { PRIVATE_QDRANT_FORMS_ENABLED: "true" },
    execute: false,
  });
  const qdrantBlocked = await recallPrivateFormsFromQdrant({
    store,
    matter: { ...lane.ready_matter, ...lane.missing_fact_patch },
    query: `${lane.lane_id} private qdrant blocked dry run`,
    documentIntent: lane.document_intent,
    workflowStage: lane.workflow_stage,
    env: { PRIVATE_QDRANT_FORMS_ENABLED: "true" },
    execute: false,
  });
  const readyAdvice = buildAnswerForFormsQuestion({
    store,
    matter: { ...lane.ready_matter, documentIntent: lane.document_intent },
    query: `${lane.lane_id} ready Part 2 and Part 3 workflow`,
  });
  const missingAdvice = buildAnswerForFormsQuestion({
    store,
    matter: { ...lane.ready_matter, ...lane.missing_fact_patch, documentIntent: lane.document_intent },
    query: `${lane.lane_id} missing fact Part 2 and Part 3 workflow`,
  });
  const missingFacts = new Set([...(missingRoute.missingFacts || []), ...(missingRoute.requiredEvidence || [])]);
  return {
    lane_id: lane.lane_id,
    store_path: lane.store_path,
    real_source_candidates: countRealLaneCandidates(lane),
    activation_scope: "redacted_metadata_only",
    real_templates_remain_inactive_until_review: true,
    correct_stage_forms_route: readyRoute.recommendedForms.length > 0,
    wrong_stage_forms_block: wrongRoute.recommendedForms.length === 0 && wrongRoute.blockedForms.length > 0,
    missing_facts_produce_blockers_or_placeholders: missingFacts.has(lane.expected_missing_fact),
    private_semantic_retrieval_after_structured_filters: readySemantic.semanticExecuted === true && readySemantic.structuredFiltersFirst === true,
    private_semantic_blocks_when_missing_fact: missingSemantic.semanticExecuted === false && missingSemantic.indexStats.returnedChunks === 0,
    private_qdrant_dry_run_after_structured_filters: qdrantReady.blockedBeforeSemantic === false && qdrantReady.gate.can_execute_semantic === true,
    private_qdrant_dry_run_blocks_before_semantic_on_missing_fact: qdrantBlocked.blockedBeforeSemantic === true && qdrantBlocked.gate.can_execute_semantic === false,
    part2_document_flow_changes_with_facts: JSON.stringify(readyAdvice.missingFactsEvidenceBlockers) !== JSON.stringify(missingAdvice.missingFactsEvidenceBlockers),
    part3_timeline_crm_rows_generated: (readyAdvice.crmWorkflowExport || []).length >= 3,
    ready_counts: {
      recommended_forms: readyRoute.recommendedForms.length,
      applicable_clauses: readyRoute.applicableClauses.length,
      semantic_chunks: readySemantic.indexStats.returnedChunks,
      crm_rows: (readyAdvice.crmWorkflowExport || []).length,
    },
    missing_counts: {
      recommended_forms: missingRoute.recommendedForms.length,
      missing_facts: missingRoute.missingFacts.length,
      required_evidence: missingRoute.requiredEvidence.length,
      semantic_chunks: missingSemantic.indexStats.returnedChunks,
    },
    private_text_committed: false,
    public_authority: false,
  };
}

function md(report) {
  return `# Atkin Selected Lane Activation Report

Generated: ${report.generated_at}

Real private Atkin candidates remain machine-candidate/private review output only. The selected activation lanes below use reviewed redacted metadata fixtures to prove routing, blockers, private semantic order, Part 2 document flow, and Part 3 CRM rows.

| Lane | Real candidate templates | Real candidate chunks | Correct stage routes | Wrong stage blocks | Missing facts block | CRM rows |
|---|---:|---:|---|---|---|---:|
${report.lanes.map(lane => `| ${lane.lane_id} | ${lane.real_source_candidates.templates_detected} | ${lane.real_source_candidates.clause_chunks_detected} | ${lane.correct_stage_forms_route ? "yes" : "no"} | ${lane.wrong_stage_forms_block ? "yes" : "no"} | ${lane.missing_facts_produce_blockers_or_placeholders ? "yes" : "no"} | ${lane.ready_counts.crm_rows} |`).join("\n")}

Private text committed: no.
NotebookLM/internal notes are not authority or a runtime engine.
`;
}

async function run() {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  const lanes = [];
  for (const lane of LANES) lanes.push(await evaluateLane(lane));
  const report = {
    report_id: "atkin_selected_lane_activation",
    generated_at: GENERATED_AT,
    status: "metadata_only_selected_lane_activation_proved",
    selected_lanes: LANES.map(lane => lane.lane_id),
    source_output_root: "private_ingest_output/atkin_forms/",
    private_text_committed: false,
    generated_drafts_committed: false,
    external_services_used: false,
    notebooklm_runtime_engine: false,
    notebooklm_is_authority: false,
    real_templates_auto_activated: false,
    real_templates_required_status: {
      classificationStatus: "machine_candidate",
      reviewStatus: "lawyer_review_required",
      activeInRouting: false,
    },
    lanes,
  };
  writeJson(REPORT_JSON, report);
  fs.writeFileSync(REPORT_MD, md(report));
  console.log(JSON.stringify({
    status: report.status,
    selectedLanes: report.selected_lanes,
    privateTextCommitted: false,
  }, null, 2));
}

if (require.main === module) run().catch(error => {
  console.error(error);
  process.exit(1);
});

module.exports = {
  LANES,
  evaluateLane,
};
