const fs = require("fs");
const path = require("path");
const {
  ingestPrivateFormPack,
  loadFormStore,
  parseNotebooklmNotes,
  routeForms,
  recommendClauses,
  searchForms,
  applyFormTemplate,
  writeJson,
} = require("../src/forms/form_system");

const SYNTHETIC_PACK = path.join(process.cwd(), "fixtures", "forms", "synthetic_pi_pack");
const SYNTHETIC_NOTES = path.join(SYNTHETIC_PACK, "pi_usage_notes.synthetic.md");
const SYNTHETIC_STORE = path.join(process.cwd(), "fixtures", "forms", "synthetic_store");
const FORMS_DEMO_ARTIFACTS = path.join(process.cwd(), "artifacts", "forms_demo");

function parseArgs(argv = process.argv.slice(2)) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) out[key] = true;
    else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

function ensureSyntheticStore() {
  return ingestPrivateFormPack({
    input: SYNTHETIC_PACK,
    firm: "demo-firm",
    workspace: "demo-pi",
    sourcePack: "Synthetic PI Forms Pack",
    licenseNote: "Synthetic fixture only; no private or licensed template text.",
    notebooklmNotes: SYNTHETIC_NOTES,
    output: SYNTHETIC_STORE,
    uploadedBy: "codex-demo",
  });
}

function ensureArtifactsDir() {
  fs.mkdirSync(FORMS_DEMO_ARTIFACTS, { recursive: true });
  return FORMS_DEMO_ARTIFACTS;
}

function writeDemoReport(name, payload) {
  const dir = ensureArtifactsDir();
  writeJson(path.join(dir, `${name}.json`), payload);
  return path.join(dir, `${name}.json`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function loadSyntheticStore() {
  if (!fs.existsSync(path.join(SYNTHETIC_STORE, "form_templates.json"))) ensureSyntheticStore();
  return loadFormStore(SYNTHETIC_STORE);
}

function demoMatters() {
  return {
    initial: {
      practiceArea: "personal_injury",
      matterType: "road_traffic_pi",
      workflowStage: "URGENT_ACTIONS",
      clientRole: "claimant",
      injuryExists: true,
      opponentIdentified: false,
      policeReportObtained: false,
      medicalEvidenceReceived: false,
      specialDamagesEvidenceAvailable: false,
      proceedingsCommenced: false,
      clientName: "Demo Client",
      accidentDate: "2026-07-06",
      accidentLocation: "Demo Road",
    },
    preActionReady: {
      practiceArea: "personal_injury",
      matterType: "road_traffic_pi",
      workflowStage: "PRE_ACTION_CORRESPONDENCE",
      clientRole: "claimant",
      injuryExists: true,
      opponentIdentified: true,
      policeReportObtained: true,
      medicalEvidenceReceived: true,
      medicalReportSummary: "soft tissue injury; prognosis pending",
      specialDamagesEvidenceAvailable: true,
      specialDamagesItems: "taxi receipts and clinic invoices",
      liabilityFactsKnown: true,
      proceedingsCommenced: false,
      clientName: "Demo Client",
      accidentDate: "2026-07-06",
      accidentLocation: "Demo Road",
      responseDeadlineDays: 14,
    },
    commenced: {
      practiceArea: "personal_injury",
      matterType: "road_traffic_pi",
      workflowStage: "COMMENCEMENT",
      clientRole: "claimant",
      opponentIdentified: true,
      medicalEvidenceReceived: true,
      specialDamagesEvidenceAvailable: true,
      proceedingsCommenced: true,
      lawyerDecisionToCommence: true,
      clientName: "Demo Client",
      defendantName: "Demo Defendant",
      accidentDate: "2026-07-06",
    },
  };
}

function validateCoreStore(store = loadSyntheticStore()) {
  assert(store.templates.length >= 3, "Expected at least 3 synthetic templates");
  assert(store.clauses.length >= 6, "Expected extracted clause snippets");
  assert(store.usageRules.length >= store.clauses.length, "Expected usage rules for clauses");
  assert(store.notebooklmUsageNotes.every(n => n.provenanceLabel === "INTERNAL_USAGE_NOTE"), "NotebookLM notes must be INTERNAL_USAGE_NOTE");
  for (const template of store.templates) {
    assert(template.documentIntent, `Template ${template.id} lacks documentIntent`);
    assert(template.proceduralStage, `Template ${template.id} lacks proceduralStage`);
    assert(Array.isArray(template.prerequisites), `Template ${template.id} lacks prerequisites`);
    assert(Array.isArray(template.contraindications), `Template ${template.id} lacks contraindications`);
    assert(template.sourceLicenseNote, `Template ${template.id} lacks sourceLicenseNote`);
    assert(Array.isArray(template.fieldSchema), `Template ${template.id} lacks fieldSchema`);
    assert(template.provenanceLabel === "TEMPLATE_BASED", `Template ${template.id} must be TEMPLATE_BASED`);
  }
  for (const clause of store.clauses) {
    assert(clause.clauseType, `Clause ${clause.id} lacks clauseType`);
    assert((clause.useWhen || []).length || (clause.doNotUseWhen || []).length, `Clause ${clause.id} lacks usage rules`);
    assert(clause.sourceLocation, `Clause ${clause.id} lacks sourceLocation`);
    assert(clause.reviewStatus, `Clause ${clause.id} lacks reviewStatus`);
    assert(clause.provenanceLabel === "TEMPLATE_BASED", `Clause ${clause.id} must be TEMPLATE_BASED`);
  }
  return true;
}

module.exports = {
  FORMS_DEMO_ARTIFACTS,
  SYNTHETIC_NOTES,
  SYNTHETIC_PACK,
  SYNTHETIC_STORE,
  applyFormTemplate,
  assert,
  demoMatters,
  ensureArtifactsDir,
  ensureSyntheticStore,
  ingestPrivateFormPack,
  loadFormStore,
  loadSyntheticStore,
  parseArgs,
  parseNotebooklmNotes,
  recommendClauses,
  routeForms,
  searchForms,
  validateCoreStore,
  writeDemoReport,
};
