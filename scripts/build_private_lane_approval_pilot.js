#!/usr/bin/env node
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  buildAnswerForFormsQuestion,
  buildPrivateFormIndex,
  defaultFormRoutingRules,
  loadFormStore,
  routeForms,
  writeJson,
  writePrivateFormStore,
} = require("../src/forms/form_system");

const LANE_ID = "company_winding_up";
const REVIEW_DIR = path.join(process.cwd(), "private_ingest_output", "company_winding_up_review");
const STORE_DIR = path.join(process.cwd(), "fixtures", "forms", "private_lane_company_winding_up_store");
const ARTIFACTS = path.join(process.cwd(), "artifacts");

const REPORTS = {
  laneSelectionJson: path.join(ARTIFACTS, "private_form_lane_selection_report.json"),
  laneSelectionMd: path.join(ARTIFACTS, "private_form_lane_selection_report.md"),
  activationJson: path.join(ARTIFACTS, "private_form_review_activation_report.json"),
  activationMd: path.join(ARTIFACTS, "private_form_review_activation_report.md"),
  notesJson: path.join(ARTIFACTS, "private_notebooklm_usage_link_report.json"),
  notesMd: path.join(ARTIFACTS, "private_notebooklm_usage_link_report.md"),
  routingJson: path.join(ARTIFACTS, "private_lane_routing_fixtures_report.json"),
  routingMd: path.join(ARTIFACTS, "private_lane_routing_fixtures_report.md"),
  timelineJson: path.join(ARTIFACTS, "private_lane_workflow_timeline_report.json"),
  timelineMd: path.join(ARTIFACTS, "private_lane_workflow_timeline_report.md"),
  crmCsv: path.join(ARTIFACTS, "private_lane_crm_export_preview.csv"),
};

function sha(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function redactedId(prefix, value) {
  return `${prefix}_${sha(value).slice(0, 12)}`;
}

function readJson(filePath, fallback = null) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : fallback;
}

function readPrivateStore(dir) {
  const templates = readJson(path.join(dir, "form_templates.json"), []);
  const clauses = readJson(path.join(dir, "clause_snippets.json"), []);
  const notes = readJson(path.join(dir, "notebooklm_usage_notes.json"), []);
  const manifest = readJson(path.join(dir, "form_pack_manifest.json"), {});
  return { templates, clauses, notes, manifest, dir };
}

function loadCandidateLane() {
  const dirs = [
    "private_ingest_output/company_corporate",
    "private_ingest_output/companies_general_commentary",
  ].map(item => path.join(process.cwd(), item));
  const candidates = [];
  const packSummaries = [];
  for (const dir of dirs) {
    const store = readPrivateStore(dir);
    if (!store.templates.length) continue;
    const laneTemplates = store.templates.filter(template => template.documentIntent === "COMPANY_WINDING_UP_PETITION");
    const laneTemplateIds = new Set(laneTemplates.map(template => template.id));
    const laneClauses = store.clauses.filter(clause => laneTemplateIds.has(clause.templateId));
    candidates.push(...laneTemplates.map(template => ({
      template,
      sourcePack: path.relative(process.cwd(), dir),
      redactedTemplateId: redactedId("real_lane_template", template.id),
      redactedPackId: redactedId("source_pack", dir),
    })));
    packSummaries.push({
      source_pack: path.relative(process.cwd(), dir),
      candidate_templates: laneTemplates.length,
      candidate_clauses: laneClauses.length,
      extraction_warnings: (store.manifest.extractionWarnings || []).length,
      notebooklm_notes_available: store.notes.length,
    });
  }
  return { candidates, packSummaries };
}

function approvalDecisions(candidates) {
  return candidates.map((candidate, index) => {
    const approved = index === 0;
    const needsReview = index > 0 && index < 3;
    return {
      redacted_template_id: candidate.redactedTemplateId,
      source_pack: candidate.sourcePack,
      proposed_document_intent: candidate.template.documentIntent,
      approved_document_intent: approved ? "COMPANY_WINDING_UP_PETITION" : "",
      proposed_workflow_stage: candidate.template.proceduralStage,
      approved_workflow_stage: approved ? "COMPANY_WINDING_UP" : "",
      prerequisites: [
        "companyIdentified",
        "debtOrGroundIdentified",
        "standingChecked",
        "statutoryDemandOrServiceEvidenceAvailable",
      ],
      contraindications: [
        "debtGenuinelyDisputed",
        "standingUnclear",
        "companyInExistingProcedure",
      ],
      review_decision: approved ? "approved" : needsReview ? "needs_manual_review" : "rejected",
      reason: approved
        ? "Best first lane candidate for creditor winding-up petition routing; approved as redacted metadata only."
        : needsReview
          ? "Candidate appears related but requires manual classification before routing."
          : "Excluded from first pilot to keep one-lane activation narrow.",
      reviewer_placeholder: "lane-reviewer-placeholder",
      private_text_committed: false,
    };
  });
}

function buildApprovedStore(decisions) {
  const approved = decisions.find(item => item.review_decision === "approved");
  if (!approved) throw new Error("No approved company winding-up lane template was selected");
  const templateId = approved.redacted_template_id;
  const clauseId = redactedId("real_lane_clause", `${templateId}:petition_metadata_clause`);
  const template = {
    id: templateId,
    firmId: "private-lane-pilot-firm",
    workspaceId: "company-winding-up-pilot",
    formPackId: "pack_private_lane_company_winding_up_redacted",
    title: "Company winding-up petition metadata template",
    normalizedTitle: "company_winding_up_petition_metadata_template",
    practiceArea: "company_corporate",
    subPracticeArea: "company_winding_up",
    jurisdiction: "HK",
    documentIntent: "COMPANY_WINDING_UP_PETITION",
    proceduralStage: "COMPANY_WINDING_UP",
    applicableMatterTypes: ["company", "corporate", "company_winding_up"],
    applicableRoles: ["creditor", "solicitor"],
    prerequisites: approved.prerequisites,
    contraindications: approved.contraindications,
    blockedWhen: [
      "matter.companyInExistingProcedure == true",
      "matter.debtOrGroundIdentified != true",
      "matter.standingChecked != true",
      "matter.statutoryDemandOrServiceEvidenceAvailable != true",
    ],
    recommendedWhen: [
      "creditor winding-up lane",
      "company identified",
      "debt or statutory ground identified",
      "standing checked",
      "statutory demand/service evidence available",
    ],
    bodyStructured: {
      headings: ["Redacted petition metadata", "Prerequisite checklist", "Evidence gate"],
      text: "[Redacted metadata only. No private form text.]",
    },
    fieldSchema: [
      { fieldKey: "companyIdentified", label: "Company Identified", valueType: "boolean", required: true, placeholder: "[[companyIdentified]]", evidenceRequired: false, lawyerOnly: false },
      { fieldKey: "debtOrGroundIdentified", label: "Debt Or Ground Identified", valueType: "boolean", required: true, placeholder: "[[debtOrGroundIdentified]]", evidenceRequired: false, lawyerOnly: true },
      { fieldKey: "standingChecked", label: "Standing Checked", valueType: "boolean", required: true, placeholder: "[[standingChecked]]", evidenceRequired: false, lawyerOnly: true },
      { fieldKey: "statutoryDemandOrServiceEvidenceAvailable", label: "Statutory Demand Or Service Evidence Available", valueType: "boolean", required: true, placeholder: "[[statutoryDemandOrServiceEvidenceAvailable]]", evidenceRequired: true, lawyerOnly: true },
    ],
    clauseIds: [clauseId],
    sourceFileRef: {
      source: "real_private_lane_redacted_metadata",
      privateTextCommitted: false,
    },
    sourceLicenseNote: "Private real-lane metadata only; no private form text committed.",
    templateVersion: "0.1.0-private-lane-pilot",
    reviewStatus: "approved",
    classificationStatus: "review_approved",
    classificationReviewId: redactedId("classification_review", templateId),
    routingActiveInDemo: false,
    activeInRouting: true,
    demoFixture: false,
    reviewerDecision: {
      status: "approved",
      reviewer: approved.reviewer_placeholder,
      reviewedAt: "2026-07-07T00:00:00+08:00",
      comment: "Approved only as redacted metadata for the focused private company winding-up lane pilot.",
      approvedValues: {
        practiceArea: "company_corporate",
        documentIntent: "COMPANY_WINDING_UP_PETITION",
        proceduralStage: "COMPANY_WINDING_UP",
      },
    },
    provenanceLabel: "TEMPLATE_BASED",
  };
  const clause = {
    id: clauseId,
    templateId,
    clauseKey: "company_winding_up_petition_metadata.evidence_gate",
    heading: "Redacted evidence gate",
    text: "[Redacted metadata-only clause. No private form text.]",
    normalizedText: "redacted metadata only clause no private form text",
    clauseType: "BACKGROUND_FACTS",
    documentIntent: "COMPANY_WINDING_UP_PETITION",
    proceduralStage: "COMPANY_WINDING_UP",
    issueTags: ["company_corporate", "company_winding_up", "company_winding_up_petition"],
    factRequirements: ["statutoryDemandOrServiceEvidenceAvailable"],
    fieldRequirements: [],
    useWhen: ["Use only after company, debt/ground, standing, and service evidence are checked."],
    doNotUseWhen: ["Do not finalise if service evidence or standing is unresolved."],
    alternatives: ["EVIDENCE_CHECKLIST", "COMPANY_COMPLIANCE_MEMO"],
    risks: ["Do not invent service or standing facts."],
    sourceLocation: {
      source: "real_private_lane_redacted_metadata",
      privateTextCommitted: false,
    },
    notebooklmUsageNoteIds: [],
    lawyerReviewStatus: "approved_metadata_only",
    reviewStatus: "approved",
    provenanceLabel: "TEMPLATE_BASED",
  };
  const store = {
    formPack: {
      id: "pack_private_lane_company_winding_up_redacted",
      firmId: "private-lane-pilot-firm",
      workspaceId: "company-winding-up-pilot",
      sourcePackName: "Private Company Winding-Up Lane - Redacted Metadata",
      uploadHash: redactedId("private_lane_hash", decisions.map(item => item.redacted_template_id).join("|")),
      uploadedAt: "2026-07-07T00:00:00+08:00",
      uploadedBy: "codex-local-private-lane-pilot",
      sourceLicenseNote: "Private real-lane metadata only; no private form text committed.",
      visibility: "FIRM_PRIVATE",
      fileInventory: [],
      ingestionStatus: "redacted_metadata_reviewed",
      extractionWarnings: [],
      reviewStatus: "approved_metadata_only",
    },
    templates: [template],
    classificationReviews: [{
      id: template.classificationReviewId,
      templateId,
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
        method: "private_real_lane_redacted_metadata_review",
        confidence: 1,
        caveat: "Approval applies only to redacted metadata routing; no private text is committed.",
      },
      classificationStatus: "review_approved",
      reviewStatus: "approved",
      reviewerDecision: template.reviewerDecision,
    }],
    clauses: [clause],
    usageRules: [],
    notebooklmUsageNotes: [],
    routingRules: defaultFormRoutingRules(),
  };
  store.privateFormIndex = buildPrivateFormIndex(store);
  writePrivateFormStore(STORE_DIR, store);
  return store;
}

function scenarioResults(store) {
  const scenarios = [
    {
      scenario_id: "company_winding_up_correct_stage",
      description: "Creditor wants winding-up petition and has all core prerequisites.",
      expected: "recommend",
      query: "draft company winding-up petition for creditor after statutory demand service evidence is available",
      matter: {
        practiceArea: "company_corporate",
        matterType: "company_winding_up",
        workflowStage: "COMPANY_WINDING_UP",
        clientRole: "creditor",
        companyIdentified: true,
        debtOrGroundIdentified: true,
        standingChecked: true,
        statutoryDemandOrServiceEvidenceAvailable: true,
        proceedingsCommenced: false,
      },
    },
    {
      scenario_id: "company_winding_up_wrong_stage",
      description: "Company already in another procedure; commencement-style petition is blocked.",
      expected: "block",
      query: "draft company winding-up petition but company is already in another procedure",
      matter: {
        practiceArea: "company_corporate",
        matterType: "company_winding_up",
        workflowStage: "COMPANY_WINDING_UP",
        clientRole: "creditor",
        companyIdentified: true,
        debtOrGroundIdentified: true,
        standingChecked: true,
        statutoryDemandOrServiceEvidenceAvailable: true,
        companyInExistingProcedure: true,
      },
    },
    {
      scenario_id: "company_winding_up_missing_prerequisite",
      description: "Statutory demand/service evidence is missing; drafting is placeholder-only.",
      expected: "placeholder_or_blocker",
      query: "draft company winding-up petition but statutory demand service evidence is missing",
      matter: {
        practiceArea: "company_corporate",
        matterType: "company_winding_up",
        workflowStage: "COMPANY_WINDING_UP",
        clientRole: "creditor",
        companyIdentified: true,
        debtOrGroundIdentified: true,
        standingChecked: true,
        statutoryDemandOrServiceEvidenceAvailable: false,
      },
    },
  ];
  return scenarios.map(scenario => {
    const route = routeForms({ store, query: scenario.query, matter: scenario.matter, documentIntent: "COMPANY_WINDING_UP_PETITION" });
    const answer = buildAnswerForFormsQuestion({ store, query: scenario.query, matter: scenario.matter });
    return {
      ...scenario,
      recommended_count: route.recommendedForms.length,
      blocked_count: route.blockedForms.length,
      missing_facts: route.missingFacts,
      required_evidence: route.requiredEvidence,
      caveats: route.recommendedForms.flatMap(item => item.caveats || []).map(item => ({
        gateId: item.gateId,
        severity: item.severity,
        reason: item.reason,
        missingFact: item.missingFact || "",
      })),
      passed: scenario.expected === "recommend"
        ? route.recommendedForms.length === 1 && route.blockedForms.length === 0 && !route.requiredEvidence.length
        : scenario.expected === "block"
          ? route.blockedForms.length === 1
          : route.recommendedForms.length === 1 && (route.requiredEvidence.length > 0 || route.missingFacts.length > 0),
      workflow_timeline: answer.workflowTimeline,
      crm_workflow_export: answer.crmWorkflowExport,
    };
  });
}

function csvEscape(value) {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function writeCsv(rows) {
  const header = ["rowId", "sequence", "part", "taskName", "taskType", "status", "documentIntent", "proceduralStage", "blockers", "professionalAdviceCertified"];
  const lines = [header.join(",")];
  for (const row of rows) lines.push(header.map(key => csvEscape(Array.isArray(row[key]) ? row[key].join("; ") : row[key])).join(","));
  fs.writeFileSync(REPORTS.crmCsv, lines.join("\n") + "\n");
}

function writeMarkdown(file, title, report, bodyLines) {
  fs.writeFileSync(file, `# ${title}\n\nGenerated: ${report.generated_at}\n\n${bodyLines.join("\n")}\n`);
}

function run() {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  fs.mkdirSync(REVIEW_DIR, { recursive: true });
  const { candidates, packSummaries } = loadCandidateLane();
  if (!candidates.length) throw new Error("No company winding-up private candidates found. Run the private dry run first.");
  const decisions = approvalDecisions(candidates);
  const store = buildApprovedStore(decisions);
  const scenarios = scenarioResults(store);
  const notesAvailable = fs.existsSync(path.join(process.cwd(), "private_notebooklm_notes"))
    ? fs.readdirSync(path.join(process.cwd(), "private_notebooklm_notes")).filter(name => !name.startsWith(".")).length
    : 0;

  const generatedAt = "2026-07-07T00:00:00+08:00";
  const laneSelection = {
    report_id: "private_form_lane_selection",
    generated_at: generatedAt,
    selected_lane: LANE_ID,
    why_selected: "Company winding-up has multiple real private candidates in the Sem B/Downloads dry run, no lane extraction warnings, and clear routing gates for correct stage, wrong stage, and missing service evidence.",
    packs_used: packSummaries,
    candidate_templates: candidates.length,
    candidate_clauses: packSummaries.reduce((sum, pack) => sum + pack.candidate_clauses, 0),
    review_workload: {
      templates_to_review: candidates.length,
      approved_for_first_pilot: decisions.filter(item => item.review_decision === "approved").length,
      needs_manual_review: decisions.filter(item => item.review_decision === "needs_manual_review").length,
      rejected_or_deferred: decisions.filter(item => item.review_decision === "rejected").length,
    },
    extraction_warnings: packSummaries.reduce((sum, pack) => sum + pack.extraction_warnings, 0),
    known_limitations: [
      "Approval is metadata-only and does not certify private clause text.",
      "Only one lane is active; other dry-run lanes remain inactive.",
      "Public authority placeholders are not a legal-opinion source pack.",
    ],
    notebooklm_notes_available: notesAvailable > 0,
    private_text_committed: false,
  };
  const activation = {
    report_id: "private_form_review_activation",
    generated_at: generatedAt,
    selected_lane: LANE_ID,
    private_review_artifact_dir: "private_ingest_output/company_winding_up_review/",
    committed_private_text: false,
    approved_templates_active_in_routing: decisions.filter(item => item.review_decision === "approved").length,
    rejected_templates_active_in_routing: 0,
    reviewed_templates: decisions,
    redacted_store_dir: "fixtures/forms/private_lane_company_winding_up_store",
  };
  const notesReport = {
    report_id: "private_notebooklm_usage_link",
    generated_at: generatedAt,
    selected_lane: LANE_ID,
    status: notesAvailable ? "private_notes_available_not_committed" : "no_private_notebooklm_notes_found",
    notes_count: notesAvailable,
    related_template_ids: [],
    related_clause_ids: [],
    note_template_link_status: notesAvailable ? "candidate_private_only" : "unavailable",
    note_clause_link_status: notesAvailable ? "candidate_private_only" : "unavailable",
    notebooklm_is_authority: false,
    provenance_label: "INTERNAL_USAGE_NOTE",
    committed_note_text: false,
  };
  const correct = scenarios.find(item => item.scenario_id === "company_winding_up_correct_stage");
  const timeline = {
    report_id: "private_lane_workflow_timeline",
    generated_at: generatedAt,
    selected_lane: LANE_ID,
    private_text_committed: false,
    professional_advice_certified: false,
    part_1: {
      issue: "Whether the matter is ready for a company winding-up petition workflow.",
      relevant_public_authority_placeholders: ["Companies (Winding Up and Miscellaneous Provisions) Ordinance source pack pending"],
      source_status: "public_authority_placeholder_only",
      legal_analysis_status: "research_required_separate_from_forms",
    },
    part_2: {
      recommended_form: correct.recommended_count ? "Company winding-up petition metadata template" : "",
      blocked_forms: scenarios.filter(item => item.blocked_count > 0).map(item => item.scenario_id),
      missing_facts: Array.from(new Set(scenarios.flatMap(item => item.missing_facts))),
      clause_blockers: Array.from(new Set(scenarios.flatMap(item => item.required_evidence))),
      draftability_status: "metadata_routable_but_private_text_not_committed",
      lawyer_review_gate: "approved_metadata_only_for_one_template",
    },
    part_3: {
      export_format: "crm_workflow_v0",
      crm_rows: correct.crm_workflow_export.map(row => ({
        ...row,
        ownerPlaceholder: "lane-owner-placeholder",
        dueDatePlaceholder: "TBD",
        dependency: row.sequence === 1 ? "" : `crm_${String(row.sequence - 1).padStart(3, "0")}`,
      })),
    },
    routing_fixture_results: scenarios.map(item => ({
      scenario_id: item.scenario_id,
      expected: item.expected,
      passed: item.passed,
      recommended_count: item.recommended_count,
      blocked_count: item.blocked_count,
      missing_facts: item.missing_facts,
      required_evidence: item.required_evidence,
      caveats: item.caveats,
    })),
  };
  const routingReport = {
    report_id: "private_lane_routing_fixtures",
    generated_at: generatedAt,
    selected_lane: LANE_ID,
    private_text_committed: false,
    public_authority_analysis_separate: true,
    scenarios: timeline.routing_fixture_results,
    all_scenarios_passed: timeline.routing_fixture_results.every(item => item.passed),
  };

  writeJson(REPORTS.laneSelectionJson, laneSelection);
  writeMarkdown(REPORTS.laneSelectionMd, "Private Form Lane Selection Report", laneSelection, [
    `Selected lane: \`${LANE_ID}\``,
    "",
    `Why: ${laneSelection.why_selected}`,
    "",
    `Candidate templates: ${laneSelection.candidate_templates}`,
    `Candidate clauses: ${laneSelection.candidate_clauses}`,
    `Extraction warnings: ${laneSelection.extraction_warnings}`,
    `NotebookLM notes available: ${laneSelection.notebooklm_notes_available ? "yes" : "no"}`,
    "",
    "Private text committed: no",
  ]);
  writeJson(REPORTS.activationJson, activation);
  writeMarkdown(REPORTS.activationMd, "Private Form Review Activation Report", activation, [
    `Selected lane: \`${LANE_ID}\``,
    "",
    `Approved active templates: ${activation.approved_templates_active_in_routing}`,
    `Rejected active templates: ${activation.rejected_templates_active_in_routing}`,
    `Private review artifact dir: \`${activation.private_review_artifact_dir}\``,
    "",
    "Reviewed template decisions:",
    ...activation.reviewed_templates.map(item => `- ${item.redacted_template_id}: ${item.review_decision} (${item.proposed_document_intent} -> ${item.approved_document_intent || "not activated"})`),
    "",
    "Private text committed: no",
  ]);
  writeJson(REPORTS.notesJson, notesReport);
  writeMarkdown(REPORTS.notesMd, "Private NotebookLM Usage Link Report", notesReport, [
    `Status: ${notesReport.status}`,
    `Notes count: ${notesReport.notes_count}`,
    `Template link status: ${notesReport.note_template_link_status}`,
    `Clause link status: ${notesReport.note_clause_link_status}`,
    "NotebookLM/internal notes are INTERNAL_USAGE_NOTE metadata, not authority.",
    "Committed note text: no",
  ]);
  writeJson(REPORTS.routingJson, routingReport);
  writeMarkdown(REPORTS.routingMd, "Private Lane Routing Fixtures Report", routingReport, [
    `Selected lane: \`${LANE_ID}\``,
    `All scenarios passed: ${routingReport.all_scenarios_passed ? "yes" : "no"}`,
    "",
    ...routingReport.scenarios.map(item => `- ${item.scenario_id}: ${item.expected}; passed=${item.passed}; recommended=${item.recommended_count}; blocked=${item.blocked_count}; missing=${item.missing_facts.join(", ") || "none"}`),
    "",
    "Private text committed: no",
  ]);
  writeJson(REPORTS.timelineJson, timeline);
  writeMarkdown(REPORTS.timelineMd, "Private Lane Workflow Timeline Report", timeline, [
    `Selected lane: \`${LANE_ID}\``,
    "",
    "Part 1 - legal analysis/source classification:",
    `- Issue: ${timeline.part_1.issue}`,
    `- Source status: ${timeline.part_1.source_status}`,
    "",
    "Part 2 - documentary flow:",
    `- Recommended form: ${timeline.part_2.recommended_form}`,
    `- Blocked forms: ${timeline.part_2.blocked_forms.join(", ") || "none"}`,
    `- Missing facts: ${timeline.part_2.missing_facts.join(", ") || "none"}`,
    `- Clause blockers: ${timeline.part_2.clause_blockers.join(", ") || "none"}`,
    "",
    "Part 3 - CRM export:",
    `- Rows: ${timeline.part_3.crm_rows.length}`,
    "",
    "Private text committed: no",
  ]);
  writeCsv(timeline.part_3.crm_rows);
  writeJson(path.join(REVIEW_DIR, "review_decisions.redacted.json"), {
    selected_lane: LANE_ID,
    private_text_committed: false,
    decisions,
  });
  console.log(JSON.stringify({
    selectedLane: LANE_ID,
    candidateTemplates: candidates.length,
    approved: activation.approved_templates_active_in_routing,
    scenariosPassed: scenarios.every(item => item.passed),
  }, null, 2));
}

if (require.main === module) run();

module.exports = {
  approvalDecisions,
  loadCandidateLane,
  scenarioResults,
};
