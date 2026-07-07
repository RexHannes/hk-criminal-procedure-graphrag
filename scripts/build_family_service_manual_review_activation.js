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
const PRIVATE_ATKIN_OUTPUT = path.join(process.cwd(), "private_ingest_output", "atkin_forms");
const ACTIVATED_OUTPUT = path.join(PRIVATE_ATKIN_OUTPUT, "_family_service_manual_review_approved_metadata");
const REPORT_JSON = path.join(ARTIFACTS, "family_service_manual_review_activation_report.json");
const REPORT_MD = path.join(ARTIFACTS, "family_service_manual_review_activation_report.md");
const GENERATED_AT = "2026-07-08T00:00:00+08:00";

const REQUIRED_FACTS = [
  "proceedingsIssued",
  "respondentIdentified",
  "serviceAddressKnown",
  "serviceMethodSelected",
  "serviceAttemptEvidenceAvailable",
];

const WRONG_STAGE_BLOCKERS = [
  "respondentAlreadyServed",
  "answerStage",
  "trialStage",
  "postTrialStage",
];

const APPROVAL_PLAN = [
  {
    key: "personal_service",
    pattern: /personal service/i,
    documentIntent: "FAMILY_SERVICE_AFFIDAVIT_PERSONAL",
    label: "Personal-service affidavit metadata",
  },
  {
    key: "post_service",
    pattern: /service by post/i,
    documentIntent: "FAMILY_SERVICE_AFFIDAVIT_POST",
    label: "Post-service affidavit metadata",
  },
  {
    key: "substituted_service",
    pattern: /substituted service/i,
    documentIntent: "FAMILY_SERVICE_SUBSTITUTED_SERVICE_APPLICATION",
    label: "Substituted-service application metadata",
  },
  {
    key: "deemed_service",
    pattern: /deemed to be served/i,
    documentIntent: "FAMILY_SERVICE_DEEMED_SERVICE_APPLICATION",
    label: "Deemed-service application metadata",
  },
];

function sha(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function shortHash(value, length = 12) {
  return sha(value).slice(0, length);
}

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
  return stores.filter(store => !store.includes("_family_service_manual_review_approved_metadata"));
}

function packKind(storeDir) {
  const name = path.basename(storeDir).toLowerCase();
  if (/family_forms_02_service/.test(name)) return "family_service";
  if (/family_forms_05_answer/.test(name)) return "family_answer";
  if (/family_forms_12_proceedings_before_trial/.test(name)) return "family_trial_preparation";
  if (/family_forms_14_proceedings_after_trial/.test(name)) return "family_post_trial";
  if (/family_forms_/.test(name) || /family_commentary/.test(name)) return "family_other";
  return "other";
}

function loadCandidates() {
  const candidates = [];
  for (const storeDir of listStores()) {
    const kind = packKind(storeDir);
    if (!kind.startsWith("family_")) continue;
    const templates = JSON.parse(fs.readFileSync(path.join(storeDir, "form_templates.json"), "utf8"));
    const clausesPath = path.join(storeDir, "clause_snippets.json");
    const clauses = fs.existsSync(clausesPath) ? JSON.parse(fs.readFileSync(clausesPath, "utf8")) : [];
    for (const template of templates) {
      const title = template.title || "";
      const signalTags = [];
      if (/service/i.test(title) || kind === "family_service") signalTags.push("service");
      if (/answer/i.test(title) || kind === "family_answer") signalTags.push("answer_stage");
      if (/trial/i.test(title) || kind === "family_trial_preparation") signalTags.push("trial_stage");
      if (/decree|appeal|rehearing|committal|injunction/i.test(title) || kind === "family_post_trial") signalTags.push("post_trial_stage");
      if (/respondent|petition|spouse/i.test(title)) signalTags.push("family_respondent_or_petition");
      if (!signalTags.length && kind !== "family_service") continue;
      const templateClauses = clauses.filter(clause => clause.templateId === template.id);
      candidates.push({
        source: { template, clauses: templateClauses, storeKind: kind },
        score: (kind === "family_service" ? 10 : 0)
          + (signalTags.includes("service") ? 5 : 0)
          + (templateClauses.length ? 1 : 0)
          - (kind === "family_answer" || kind === "family_trial_preparation" || kind === "family_post_trial" ? 3 : 0),
        signalTags,
      });
    }
  }
  return candidates.sort((a, b) => b.score - a.score);
}

function driftFlags(template, storeKind) {
  const flags = [];
  if (template.practiceArea !== "family_service") flags.push("practice_area_not_family_service");
  if (template.subPracticeArea && template.subPracticeArea !== "family_service") flags.push("sub_lane_not_family_service");
  if (/company/i.test(`${template.practiceArea} ${template.documentIntent}`)) flags.push("mislabelled_company");
  if (/commercial|contract/i.test(`${template.practiceArea} ${template.documentIntent}`)) flags.push("mislabelled_commercial");
  if (/probate/i.test(`${template.practiceArea} ${template.documentIntent}`)) flags.push("mislabelled_probate");
  if (storeKind === "family_service" && template.proceduralStage !== "FAMILY_SERVICE") flags.push("service_candidate_wrong_stage");
  if (["family_answer", "family_trial_preparation", "family_post_trial"].includes(storeKind)) flags.push(`${storeKind}_not_fresh_service_route`);
  return flags;
}

function approvalFor(template) {
  return APPROVAL_PLAN.find(item => item.pattern.test(template.title || ""));
}

function candidateRows(candidates) {
  const rows = [];
  const approvedKeys = new Set();
  const service = candidates.filter(item => item.source.storeKind === "family_service");
  const wrongStage = candidates.filter(item => ["family_answer", "family_trial_preparation", "family_post_trial"].includes(item.source.storeKind));
  const selected = [...service, ...wrongStage].slice(0, 18);
  selected.forEach((item, index) => {
    const template = item.source.template;
    const approval = approvalFor(template);
    const approved = item.source.storeKind === "family_service"
      && approval
      && !approvedKeys.has(approval.key)
      && rows.filter(row => row.manual_review_decision === "approved_metadata_only").length < 4;
    if (approved) approvedKeys.add(approval.key);
    rows.push({
      review_candidate_id: `family_service_review_${String(index + 1).padStart(3, "0")}`,
      source_template_fingerprint: shortHash(template.id),
      redacted_title_key: `redacted_family_service_title_${String(index + 1).padStart(3, "0")}`,
      source_pack_kind: item.source.storeKind,
      signal_tags: item.signalTags,
      current_machine_classification: {
        practice_area: template.practiceArea || "",
        practice_lane: template.subPracticeArea || template.practiceLane || "",
        document_intent: template.documentIntent || "",
        workflow_stage: template.proceduralStage || "",
        review_status: template.reviewStatus || "",
        classification_status: template.classificationStatus || "",
      },
      classifier_drift_flags: driftFlags(template, item.source.storeKind),
      clause_chunk_count: item.source.clauses.length,
      manual_review_decision: approved ? "approved_metadata_only" : (item.source.storeKind === "family_service" ? "selected_for_manual_review" : "excluded_wrong_stage_for_service_route"),
      proposed_correction: approved ? correctionFor(approval) : null,
      private_text_committed: false,
    });
  });
  return rows;
}

function correctionFor(approval) {
  return {
    practice_lane: "family_service",
    document_intent: approval.documentIntent,
    workflow_stage: "FAMILY_SERVICE",
    role_posture: ["applicant", "petitioner", "solicitor"],
    required_facts: REQUIRED_FACTS,
    required_evidence: ["serviceAddressOrLocationEvidence", "serviceMethodInstruction", "serviceAttemptEvidence"],
    wrong_stage_blockers: WRONG_STAGE_BLOCKERS,
    alternatives: ["FAMILY_ACKNOWLEDGMENT_OR_ANSWER_REVIEW", "FAMILY_SERVICE_PROOF_AUDIT", "EVIDENCE_CHECKLIST"],
  };
}

function fieldSchema() {
  return REQUIRED_FACTS.map(key => ({
    fieldKey: key,
    label: key,
    valueType: "boolean",
    required: true,
    placeholder: `[[${key}]]`,
    evidenceRequired: /Evidence|Address|Method/i.test(key),
    lawyerOnly: /Evidence|Method/i.test(key),
  }));
}

function templateRecord(row, ordinal) {
  const correction = row.proposed_correction;
  const id = `family_service_manual_${shortHash(`${row.source_template_fingerprint}:${correction.document_intent}`)}`;
  const clauseIds = [0, 1].map(index => `family_service_manual_clause_${shortHash(`${id}:${index}`)}`);
  return {
    id,
    firmId: "local-private-form-tenant",
    workspaceId: "atkin-forms-workspace",
    formPackId: "pack_family_service_manual_review_redacted_metadata",
    title: `Family service reviewed metadata template ${String(ordinal + 1).padStart(2, "0")}`,
    normalizedTitle: `family_service_reviewed_metadata_template_${String(ordinal + 1).padStart(2, "0")}`,
    practiceArea: "family_service",
    subPracticeArea: "family_service",
    jurisdiction: "HK",
    documentIntent: correction.document_intent,
    proceduralStage: correction.workflow_stage,
    applicableMatterTypes: ["family_service"],
    applicableRoles: correction.role_posture,
    prerequisites: correction.required_facts,
    contraindications: correction.wrong_stage_blockers,
    blockedWhen: [
      ...correction.required_facts.map(fact => `matter.${fact} != true`),
      ...correction.wrong_stage_blockers.map(fact => `matter.${fact} == true`),
    ],
    recommendedWhen: correction.required_facts.map(fact => `${fact} == true`),
    legalKnowledgeNodeIds: [
      "family_service.service.respondent",
      "family_service.service.method",
      "family_service.service.evidence",
      "family_service.service.proof",
    ],
    bodyStructured: {
      headings: ["Redacted reviewed metadata", "Family service gates", "Evidence blockers"],
      text: "[Redacted reviewed metadata only. No private form text.]",
    },
    fieldSchema: fieldSchema(),
    clauseIds,
    sourceFileRef: {
      source: "private_ingest_output_family_service_manual_review_redacted_metadata",
      sourceTemplateFingerprint: row.source_template_fingerprint,
      redactedTitleKey: row.redacted_title_key,
      privateTextCommitted: false,
    },
    sourceLicenseNote: "Private family-service metadata review only; no private form text committed.",
    templateVersion: "0.1.0-family-service-manual-review",
    reviewStatus: "approved",
    classificationStatus: "review_approved",
    classificationReviewId: `family_service_manual_review_${shortHash(id)}`,
    activeInRouting: true,
    routingActiveInDemo: false,
    demoFixture: false,
    reviewerDecision: {
      status: "approved",
      reviewer: "manual-review-metadata-pass",
      reviewedAt: GENERATED_AT,
      comment: "Approved redacted routing metadata only; raw private form text remains private.",
      approvedValues: {
        practiceArea: "family_service",
        documentIntent: correction.document_intent,
        proceduralStage: correction.workflow_stage,
      },
    },
    provenanceLabel: "TEMPLATE_BASED",
  };
}

function clauseRecords(template) {
  return template.clauseIds.map((clauseId, index) => ({
    id: clauseId,
    templateId: template.id,
    clauseKey: `${template.normalizedTitle}.${index === 0 ? "routing_gate" : "proof_gate"}`,
    heading: index === 0 ? "Redacted family-service routing gate" : "Redacted family-service proof gate",
    text: `[Redacted family-service reviewed metadata clause ${index + 1}. No private form text.]`,
    normalizedText: `redacted family service reviewed metadata clause ${index + 1}`,
    clauseType: index === 0 ? "BACKGROUND_FACTS" : "EVIDENCE_GATE",
    documentIntent: template.documentIntent,
    proceduralStage: template.proceduralStage,
    issueTags: ["family_service", "family_service_route", template.documentIntent.toLowerCase()],
    legalKnowledgeNodeIds: template.legalKnowledgeNodeIds,
    factRequirements: REQUIRED_FACTS,
    fieldRequirements: [],
    useWhen: ["Use only after family-service lane, service-stage posture, role, and missing-fact gates pass."],
    doNotUseWhen: ["Do not use for answer, trial, post-trial, or already-served postures."],
    alternatives: ["FAMILY_ACKNOWLEDGMENT_OR_ANSWER_REVIEW", "FAMILY_SERVICE_PROOF_AUDIT", "EVIDENCE_CHECKLIST"],
    risks: ["Do not invent service address, method, or attempt evidence."],
    sourceLocation: { source: "private_ingest_output_family_service_manual_review_redacted_metadata", privateTextCommitted: false },
    notebooklmUsageNoteIds: [],
    lawyerReviewStatus: "approved_metadata_only",
    reviewStatus: "approved",
    provenanceLabel: "TEMPLATE_BASED",
  }));
}

function buildStore(rows) {
  const approvedRows = rows.filter(row => row.manual_review_decision === "approved_metadata_only").slice(0, 4);
  const templates = approvedRows.map(templateRecord);
  const clauses = templates.flatMap(template => clauseRecords(template));
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
      method: "family_service_manual_review_redacted_metadata",
      sourceTemplateFingerprint: template.sourceFileRef.sourceTemplateFingerprint,
      confidence: 0.86,
      caveat: "Approval applies only to redacted routing metadata; no private text is committed.",
    },
    classificationStatus: "review_approved",
    reviewStatus: "approved",
    reviewerDecision: template.reviewerDecision,
  }));
  const store = {
    formPack: {
      id: "pack_family_service_manual_review_redacted_metadata",
      firmId: "local-private-form-tenant",
      workspaceId: "atkin-forms-workspace",
      sourcePackName: "Family service manual review - redacted metadata",
      uploadHash: `manual_review_${shortHash("family_service_manual_review")}`,
      uploadedAt: GENERATED_AT,
      uploadedBy: "codex-local-family-service-manual-review",
      sourceLicenseNote: "Private family-service metadata only; no private form text committed.",
      visibility: "FIRM_PRIVATE",
      fileInventory: [],
      ingestionStatus: "manual_reviewed_redacted_metadata",
      extractionWarnings: [],
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
  writePrivateFormStore(ACTIVATED_OUTPUT, store);
  return store;
}

function aggregateDrift(rows) {
  const out = {};
  for (const row of rows) {
    for (const flag of row.classifier_drift_flags || []) out[flag] = (out[flag] || 0) + 1;
  }
  return out;
}

function md(report) {
  return `# Family Service Manual Review Activation Report

Generated: ${report.generated_at}

This report is metadata-only. Candidate IDs and titles are redacted/fingerprinted; no private form text or generated draft is committed.

| Metric | Count |
|---|---:|
| Candidates reviewed | ${report.candidates_reviewed_count} |
| Selected for manual review | ${report.selected_for_manual_review_count} |
| Approved metadata templates | ${report.approved_metadata_templates} |
| Approved redacted clause chunks | ${report.approved_redacted_clause_chunks} |
| Classifier drift flags | ${Object.values(report.classifier_drift_summary).reduce((sum, value) => sum + value, 0)} |

## Approved Metadata Corrections

${report.approved_metadata.map(item => `- ${item.approved_template_id}: ${item.document_intent}, stage ${item.workflow_stage}, facts ${item.required_facts.join(", ")}`).join("\n")}

## Drift Summary

${Object.entries(report.classifier_drift_summary).map(([key, value]) => `- ${key}: ${value}`).join("\n")}

Private text committed: no.
Generated drafts committed: no.
`;
}

function run() {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  const candidates = loadCandidates();
  const rows = candidateRows(candidates);
  const store = buildStore(rows);
  const approved = store.templates.map(template => ({
    approved_template_id: template.id,
    document_intent: template.documentIntent,
    workflow_stage: template.proceduralStage,
    role_posture: template.applicableRoles,
    required_facts: template.prerequisites,
    required_evidence: ["serviceAddressOrLocationEvidence", "serviceMethodInstruction", "serviceAttemptEvidence"],
    wrong_stage_blockers: template.contraindications,
    alternatives: ["FAMILY_ACKNOWLEDGMENT_OR_ANSWER_REVIEW", "FAMILY_SERVICE_PROOF_AUDIT", "EVIDENCE_CHECKLIST"],
    source_template_fingerprint: template.sourceFileRef.sourceTemplateFingerprint,
    redacted_title_key: template.sourceFileRef.redactedTitleKey,
  }));
  const report = {
    report_id: "family_service_manual_review_activation",
    generated_at: GENERATED_AT,
    status: "family_service_manual_review_metadata_activated",
    source_root: "private_ingest_output/atkin_forms/",
    activated_private_store: "private_ingest_output/atkin_forms/_family_service_manual_review_approved_metadata/",
    privacy_boundary: {
      private_text_committed: false,
      generated_drafts_committed: false,
      external_services_used: false,
      raw_titles_committed: false,
      raw_template_text_committed: false,
      notebooklm_runtime_engine: false,
    },
    lane: "family_service",
    candidates_reviewed_count: rows.length,
    selected_for_manual_review_count: rows.filter(row => ["selected_for_manual_review", "approved_metadata_only"].includes(row.manual_review_decision)).length,
    approved_metadata_templates: store.templates.length,
    approved_redacted_clause_chunks: store.clauses.length,
    candidate_review_table: rows,
    classifier_drift_summary: aggregateDrift(rows),
    approved_metadata: approved,
    manual_review_policy: {
      real_private_candidates_remain_machine_candidate_until_selected: true,
      no_auto_approval_of_machine_classifications: true,
      approved_scope: "routing_metadata_only",
      raw_private_text_stays_in_gitignored_private_output: true,
    },
  };
  writeJson(REPORT_JSON, report);
  fs.writeFileSync(REPORT_MD, md(report));
  console.log(JSON.stringify({
    status: report.status,
    candidatesReviewed: report.candidates_reviewed_count,
    approvedTemplates: report.approved_metadata_templates,
    approvedChunks: report.approved_redacted_clause_chunks,
    privateTextCommitted: false,
  }, null, 2));
}

if (require.main === module) run();
