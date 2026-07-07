#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { loadFormStore, writeJson } = require("../src/forms/form_system");
const { buildPrivateFormFramework } = require("../src/forms/private_form_framework");

const NOTES_ROOT = path.join(process.cwd(), "private_notebooklm_notes");
const ARTIFACTS = path.join(process.cwd(), "artifacts");
const ATKIN_JSON = path.join(ARTIFACTS, "notebooklm_atkin_framework_crosscheck_report.json");
const ATKIN_MD = path.join(ARTIFACTS, "notebooklm_atkin_framework_crosscheck_report.md");
const TEXTBOOK_JSON = path.join(ARTIFACTS, "textbook_scenario_crosscheck_report.json");
const TEXTBOOK_MD = path.join(ARTIFACTS, "textbook_scenario_crosscheck_report.md");

function sha(text) {
  return crypto.createHash("sha256").update(String(text || "")).digest("hex");
}

function listNoteFiles(root = NOTES_ROOT) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isFile() && /\.(md|txt|markdown)$/i.test(entry.name))
    .map(entry => path.join(root, entry.name));
}

function summarizeNotes(files) {
  return files.map((file, index) => {
    const text = fs.readFileSync(file, "utf8");
    return {
      note_id: `internal_note_${index + 1}`,
      file_ext: path.extname(file).toLowerCase(),
      byte_size: Buffer.byteLength(text),
      sha256: sha(text),
      source_role: /scenario|textbook|trap/i.test(path.basename(file)) ? "textbook_scenario_matrix" : "atkin_form_framework",
      provenance: "INTERNAL_USAGE_NOTE",
      text_committed: false,
    };
  });
}

function frameworkExpectations() {
  return [
    {
      expectation_id: "company_winding_up_petition_framework",
      practice_lane: "company_winding_up",
      expected_document_intents: ["COMPANY_WINDING_UP_PETITION"],
      expected_blockers: ["companyIdentified", "debtOrGroundIdentified", "standingChecked", "statutoryDemandOrServiceEvidenceAvailable"],
      expected_alternatives: ["EVIDENCE_CHECKLIST", "COMPANY_COMPLIANCE_MEMO"],
    },
    {
      expectation_id: "pi_pre_action_framework",
      practice_lane: "road_traffic_personal_injury",
      expected_document_intents: ["LETTER_OF_CLAIM", "POLICE_REPORT_REQUEST", "MEDICAL_RECORDS_REQUEST"],
      expected_blockers: ["opponentIdentified", "medicalEvidenceReceived", "specialDamagesEvidenceAvailable"],
      expected_alternatives: ["POLICE_REPORT_REQUEST", "MEDICAL_RECORDS_REQUEST", "EVIDENCE_CHECKLIST"],
    },
    {
      expectation_id: "consent_route_warning",
      practice_lane: "civil_litigation_general",
      expected_document_intents: ["CONSENT_SUMMONS", "CONSENT_ORDER"],
      expected_blockers: ["consentOrderAgreed"],
      expected_alternatives: ["CONSENT_SUMMONS", "CONSENT_ORDER"],
    },
  ];
}

function runBackendFrameworkProbe() {
  const store = loadFormStore("fixtures/forms/private_lane_company_winding_up_store");
  return buildPrivateFormFramework({
    store,
    matter: {
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
    },
    query: "prepare company winding-up petition framework with evidence blockers",
    documentIntent: "COMPANY_WINDING_UP_PETITION",
    workflowStage: "COMPANY_WINDING_UP",
  });
}

function md(title, report) {
  return `# ${title}

Generated: ${report.generated_at}

NotebookLM is used only as \`INTERNAL_USAGE_NOTE\` cross-check metadata. It is not a runtime engine, authority source, approval source, or template activator.

| Metric | Count |
|---|---:|
| Internal notes discovered | ${report.internal_notes_discovered} |
| Expectations tracked | ${report.expectations.length} |
| Backend probes | ${report.backend_probes.length} |
| Mismatches | ${report.mismatches.length} |

${report.mismatches.length ? report.mismatches.map(item => `- ${item.expectation_id}: ${item.reason}`).join("\n") : "No auto-fixable mismatch is claimed. Any mismatch remains report-only."}
`;
}

function run() {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  fs.mkdirSync(NOTES_ROOT, { recursive: true });
  const notes = summarizeNotes(listNoteFiles());
  const backendProbe = runBackendFrameworkProbe();
  const expectations = frameworkExpectations();
  const mismatches = [];
  if (!backendProbe.formFamilies.some(item => item.documentIntent === "COMPANY_WINDING_UP_PETITION")) {
    mismatches.push({ expectation_id: "company_winding_up_petition_framework", reason: "backend_probe_missing_petition_intent" });
  }
  if (!backendProbe.practicalSteps.some(item => item.stepType === "collect_evidence" || item.stepType === "ask_missing_fact")) {
    mismatches.push({ expectation_id: "company_winding_up_petition_framework", reason: "backend_probe_missing_blocker_steps" });
  }
  const common = {
    generated_at: "2026-07-07T00:00:00+08:00",
    privacy_boundary: {
      internal_usage_note_only: true,
      notebooklm_runtime_engine: false,
      notebooklm_activates_templates: false,
      notebooklm_is_authority: false,
      private_note_text_committed: false,
      mismatches_auto_fixed: false,
    },
    internal_notes_discovered: notes.length,
    note_metadata: notes,
    expectations,
    backend_probes: [{
      probe_id: "company_winding_up_framework_probe",
      form_family_count: backendProbe.formFamilies.length,
      practical_step_count: backendProbe.practicalSteps.length,
      alternatives: backendProbe.alternatives,
      private_text_committed: false,
    }],
    mismatches,
  };
  const atkinReport = {
    report_id: "notebooklm_atkin_framework_crosscheck",
    status: notes.length ? "metadata_notes_parsed" : "no_private_notes_found_backend_expectations_only",
    ...common,
  };
  const textbookReport = {
    report_id: "textbook_scenario_crosscheck",
    status: notes.length ? "metadata_notes_parsed" : "no_private_notes_found_scenario_matrix_stubbed",
    scenario_benchmark_policy: "scenario_procedure_traps_report_only",
    scenario_expectations: [
      "wrong_stage_blocks_even_with_semantic_match",
      "missing_facts_block_finalisation",
      "consent_route_uses_consent_summons_or_order",
      "part_1_public_authority_stays_separate_from_part_2_forms",
    ],
    ...common,
  };
  writeJson(ATKIN_JSON, atkinReport);
  fs.writeFileSync(ATKIN_MD, md("NotebookLM Atkin Framework Cross-Check Report", atkinReport));
  writeJson(TEXTBOOK_JSON, textbookReport);
  fs.writeFileSync(TEXTBOOK_MD, md("Textbook Scenario Cross-Check Report", textbookReport));
  console.log(JSON.stringify({
    atkinStatus: atkinReport.status,
    textbookStatus: textbookReport.status,
    mismatches: mismatches.length,
  }, null, 2));
}

if (require.main === module) run();
