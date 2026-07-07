#!/usr/bin/env node
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  buildPrivateFormIndex,
  defaultFormRoutingRules,
  writeJson,
  writePrivateFormStore,
} = require("../src/forms/form_system");

const ARTIFACTS = path.join(process.cwd(), "artifacts");
const GENERATED_AT = "2026-07-07T00:00:00+08:00";

const LANES = [
  {
    laneId: "family_service",
    storeDir: "fixtures/forms/private_lane_family_service_store",
    reportBase: "family_service_lane_activation_report",
    sourceDirs: ["private_ingest_output/atkin_forms"],
    privateCandidateStatus: "family_private_ingest_candidates_detected_redacted_metadata_only",
    practiceArea: "family_service",
    matterType: "family_service",
    clientRole: "applicant",
    workflowStage: "FAMILY_SERVICE",
    requiredFacts: ["proceedingsIssued", "respondentIdentified", "serviceAddressKnown", "serviceMethodSelected"],
    templates: [
      ["FAMILY_SERVICE_ACKNOWLEDGMENT", "Family service acknowledgment metadata template", "FAMILY_SERVICE"],
      ["FAMILY_SERVICE_AFFIRMATION", "Family service affirmation metadata template", "FAMILY_SERVICE"],
    ],
    legalKnowledgeNodeIds: ["family_service.service.respondent", "family_service.service.method", "family_service.service.evidence"],
  },
  {
    laneId: "company_winding_up_provisional_liquidator",
    storeDir: "fixtures/forms/private_lane_company_provisional_liquidator_store",
    reportBase: "company_winding_up_provisional_liquidator_activation_report",
    sourceDirs: ["private_ingest_output/atkin_forms"],
    privateCandidateStatus: "company_private_ingest_candidates_reviewed_redacted_metadata_only",
    practiceArea: "company_corporate",
    matterType: "provisional_liquidator",
    clientRole: "creditor",
    workflowStage: "PROVISIONAL_LIQUIDATOR",
    requiredFacts: ["companyIdentified", "standingChecked", "urgencyGroundsIdentified", "assetRiskEvidenceAvailable"],
    templates: [
      ["COMPANY_PROVISIONAL_LIQUIDATOR_APPLICATION", "Provisional liquidator application metadata template", "PROVISIONAL_LIQUIDATOR"],
      ["COMPANY_PROVISIONAL_LIQUIDATOR_AFFIDAVIT", "Provisional liquidator supporting affidavit metadata template", "PROVISIONAL_LIQUIDATOR"],
    ],
    legalKnowledgeNodeIds: ["company_corporate.company_winding_up.provisional_liquidator", "company_corporate.company_winding_up.asset_risk_evidence"],
  },
];

function sha(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function id(prefix, value) {
  return `${prefix}_${sha(value).slice(0, 12)}`;
}

function countPrivateCandidates(lane) {
  let templates = 0;
  let clauses = 0;
  const intentSet = new Set(lane.templates.map(item => item[0]));
  const storeDirs = [];
  const walk = dir => {
    if (!fs.existsSync(dir)) return;
    if (fs.existsSync(path.join(dir, "form_templates.json"))) {
      storeDirs.push(dir);
      return;
    }
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(path.join(dir, entry.name));
    }
  };
  for (const dir of lane.sourceDirs) {
    walk(path.join(process.cwd(), dir));
  }
  for (const dir of storeDirs) {
    const tPath = path.join(dir, "form_templates.json");
    const cPath = path.join(dir, "clause_snippets.json");
    if (!fs.existsSync(tPath)) continue;
    const sourceTemplates = JSON.parse(fs.readFileSync(tPath, "utf8"));
    const sourceClauses = fs.existsSync(cPath) ? JSON.parse(fs.readFileSync(cPath, "utf8")) : [];
    const matchedIds = new Set(sourceTemplates.filter(template => (
      intentSet.has(template.documentIntent) ||
      (lane.laneId.includes("provisional") && /winding|liquidat|insolv/i.test(`${template.title} ${template.documentIntent}`)) ||
      (lane.laneId === "family_service" && /family|service|children|answer/i.test(`${template.title} ${template.documentIntent}`))
    )).map(template => template.id));
    templates += matchedIds.size;
    clauses += sourceClauses.filter(clause => matchedIds.has(clause.templateId)).length;
  }
  return { templates, clauses };
}

function templateRecord(lane, [documentIntent, title, stage], ordinal) {
  const templateId = id("lane_template", `${lane.laneId}:${documentIntent}:${ordinal}`);
  const clauseIds = [0, 1].map(index => id("lane_clause", `${templateId}:${index}`));
  return {
    id: templateId,
    firmId: "private-lane-pilot-firm",
    workspaceId: `${lane.laneId}-pilot`,
    formPackId: `pack_${lane.laneId}_redacted_metadata`,
    title,
    normalizedTitle: title.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""),
    practiceArea: lane.practiceArea,
    subPracticeArea: lane.laneId.includes("provisional") ? "company_winding_up" : lane.laneId,
    jurisdiction: "HK",
    documentIntent,
    proceduralStage: stage,
    applicableMatterTypes: [lane.matterType, lane.practiceArea],
    applicableRoles: [lane.clientRole, "solicitor"],
    prerequisites: lane.requiredFacts,
    contraindications: lane.laneId === "family_service" ? ["postTrialStage"] : ["voluntaryWindingUpOnly"],
    blockedWhen: [
      ...lane.requiredFacts.map(fact => `matter.${fact} != true`),
      lane.laneId === "family_service" ? "matter.postTrialStage == true" : "matter.voluntaryWindingUpOnly == true",
    ],
    recommendedWhen: lane.requiredFacts.map(fact => `${fact} == true`),
    legalKnowledgeNodeIds: lane.legalKnowledgeNodeIds,
    bodyStructured: {
      headings: ["Redacted lane metadata", "Prerequisite checklist", "Evidence gate"],
      text: "[Redacted metadata only. No private form text.]",
    },
    fieldSchema: lane.requiredFacts.map(fact => ({
      fieldKey: fact,
      label: fact,
      valueType: "boolean",
      required: true,
      placeholder: `[[${fact}]]`,
      evidenceRequired: /Evidence|Address|Risk|service/i.test(fact),
      lawyerOnly: !/Identified|Issued/i.test(fact),
    })),
    clauseIds,
    sourceFileRef: {
      source: "private_ingest_output_redacted_metadata_review",
      privateTextCommitted: false,
    },
    sourceLicenseNote: "Private lane metadata only; no private form text committed.",
    templateVersion: "0.1.0-expanded-lane-pilot",
    reviewStatus: "approved",
    classificationStatus: "review_approved",
    classificationReviewId: id("classification_review", templateId),
    activeInRouting: true,
    routingActiveInDemo: false,
    demoFixture: false,
    reviewerDecision: {
      status: "approved",
      reviewer: "lane-reviewer-placeholder",
      reviewedAt: GENERATED_AT,
      comment: "Approved as redacted metadata only for focused lane routing tests.",
      approvedValues: { practiceArea: lane.practiceArea, documentIntent, proceduralStage: stage },
    },
    provenanceLabel: "TEMPLATE_BASED",
  };
}

function clauseRecords(lane, template) {
  return template.clauseIds.map((clauseId, index) => ({
    id: clauseId,
    templateId: template.id,
    clauseKey: `${template.normalizedTitle}.${index === 0 ? "routing_gate" : "evidence_gate"}`,
    heading: index === 0 ? "Redacted routing gate" : "Redacted evidence gate",
    text: `[Redacted ${lane.laneId} metadata-only clause ${index + 1}. No private form text.]`,
    normalizedText: `redacted ${lane.laneId} metadata only clause ${index + 1}`,
    clauseType: index === 0 ? "BACKGROUND_FACTS" : "EVIDENCE_GATE",
    documentIntent: template.documentIntent,
    proceduralStage: template.proceduralStage,
    issueTags: [lane.practiceArea, lane.laneId, template.documentIntent.toLowerCase()],
    legalKnowledgeNodeIds: lane.legalKnowledgeNodeIds,
    factRequirements: lane.requiredFacts,
    fieldRequirements: [],
    useWhen: ["Use only after structured lane, stage, role, and missing-fact gates pass."],
    doNotUseWhen: ["Do not finalise if required facts/evidence are unresolved."],
    alternatives: ["EVIDENCE_CHECKLIST"],
    risks: ["Do not invent missing facts or evidence."],
    sourceLocation: { source: "private_ingest_output_redacted_metadata_review", privateTextCommitted: false },
    notebooklmUsageNoteIds: [],
    lawyerReviewStatus: "approved_metadata_only",
    reviewStatus: "approved",
    provenanceLabel: "TEMPLATE_BASED",
  }));
}

function buildLane(lane) {
  const candidateCounts = countPrivateCandidates(lane);
  const templates = lane.templates.map((config, index) => templateRecord(lane, config, index));
  const clauses = templates.flatMap(template => clauseRecords(lane, template));
  const classificationReviews = templates.map(template => ({
    id: template.classificationReviewId,
    templateId: template.id,
    firmId: template.firmId,
    workspaceId: template.workspaceId,
    proposed: {
      practiceArea: template.practiceArea,
      documentIntent: template.documentIntent,
      proceduralStage: template.proceduralStage,
      matterTypes: template.applicableMatterTypes,
      prerequisites: template.prerequisites,
      contraindications: template.contraindications,
    },
    extractionTrace: {
      method: "expanded_lane_redacted_metadata_review",
      confidence: candidateCounts.templates > 0 ? 0.8 : 0.4,
      caveat: "Approval applies only to redacted routing metadata; no private text is committed.",
    },
    classificationStatus: "review_approved",
    reviewStatus: "approved",
    reviewerDecision: template.reviewerDecision,
  }));
  const store = {
    formPack: {
      id: `pack_${lane.laneId}_redacted_metadata`,
      firmId: "private-lane-pilot-firm",
      workspaceId: `${lane.laneId}-pilot`,
      sourcePackName: `${lane.laneId} - Redacted Metadata`,
      uploadHash: id("lane_hash", lane.laneId),
      uploadedAt: GENERATED_AT,
      uploadedBy: "codex-local-expanded-lane-pilot",
      sourceLicenseNote: "Private lane metadata only; no private form text committed.",
      visibility: "FIRM_PRIVATE",
      fileInventory: [],
      ingestionStatus: "redacted_metadata_reviewed",
      extractionWarnings: candidateCounts.templates ? [] : ["No matching private-ingest candidate files found locally for this lane; activation is redacted metadata shell only."],
      reviewStatus: "approved_metadata_only",
    },
    templates,
    classificationReviews,
    clauses,
    usageRules: [],
    notebooklmUsageNotes: [],
    routingRules: defaultFormRoutingRules(),
  };
  store.privateFormIndex = buildPrivateFormIndex(store);
  writePrivateFormStore(path.join(process.cwd(), lane.storeDir), store);
  return { store, candidateCounts };
}

function writeReport(lane, result) {
  const report = {
    report_id: lane.reportBase,
    generated_at: GENERATED_AT,
    selected_lane: lane.laneId,
    private_text_committed: false,
    public_authority: false,
    notebooklm_is_authority: false,
    source_dirs_checked: lane.sourceDirs,
    private_candidate_status: lane.privateCandidateStatus,
    private_candidates_detected: result.candidateCounts,
    approved_metadata_templates: result.store.templates.length,
    approved_redacted_clause_records: result.store.clauses.length,
    review_queue_records: result.store.classificationReviews.length,
    wrong_stage_tests_required: true,
    missing_fact_blocker_tests_required: true,
    part2_document_flow_tests_required: true,
    part3_timeline_tests_required: true,
    store_dir: lane.storeDir,
    remaining_limitations: result.candidateCounts.templates
      ? ["Approved metadata only; raw private text remains private."]
      : ["No matching private-ingest candidates were found locally for this lane; use private_notebooklm_notes/private_ingest_output to replace the metadata shell before production."],
  };
  writeJson(path.join(ARTIFACTS, `${lane.reportBase}.json`), report);
  fs.writeFileSync(path.join(ARTIFACTS, `${lane.reportBase}.md`), `# ${lane.laneId} Activation Report\n\nGenerated: ${GENERATED_AT}\n\n| Metric | Count |\n|---|---:|\n| Private candidate templates detected | ${report.private_candidates_detected.templates} |\n| Private candidate clauses detected | ${report.private_candidates_detected.clauses} |\n| Approved metadata templates | ${report.approved_metadata_templates} |\n| Approved redacted clause records | ${report.approved_redacted_clause_records} |\n\nPrivate text committed: no.\n\nNotebookLM/internal notes are not authority.\n`);
  return report;
}

function run() {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  const reports = [];
  for (const lane of LANES) reports.push(writeReport(lane, buildLane(lane)));
  console.log(JSON.stringify({
    expandedLanes: reports.map(report => report.selected_lane),
    approvedTemplates: reports.reduce((sum, report) => sum + report.approved_metadata_templates, 0),
    privateTextCommitted: false,
  }, null, 2));
}

if (require.main === module) run();

module.exports = {
  LANES,
  buildLane,
};
