#!/usr/bin/env node
const path = require("path");
const {
  buildPrivateFormIndex,
  defaultFormRoutingRules,
  writeJson,
  writePrivateFormStore,
} = require("../src/forms/form_system");
const { ensureArtifactsDir, loadSyntheticStore } = require("./forms_cli_common");

const OUTPUT_DIR = path.join(process.cwd(), "fixtures", "forms", "approved_demo_subset_store");
const REPORT_JSON = path.join(process.cwd(), "artifacts", "forms_approved_demo_subset_report.json");
const REPORT_MD = path.join(process.cwd(), "artifacts", "forms_approved_demo_subset_report.md");

const APPROVED_INTENTS = new Set(["LETTER_OF_CLAIM", "POLICE_REPORT_REQUEST", "MEDICAL_RECORDS_REQUEST"]);
const CLAUSE_TYPES = new Set([
  "PARTY_DESCRIPTION",
  "LIABILITY_ALLEGATION",
  "MEDICAL_EVIDENCE",
  "SPECIAL_DAMAGES",
  "SETTLEMENT_PROPOSAL",
  "POLICE_REPORT_REQUEST",
  "DOCUMENT_REQUEST",
  "BACKGROUND_FACTS",
]);

function approveTemplate(template) {
  return {
    ...template,
    sourceFileRef: {
      source: "synthetic_redacted_demo_metadata",
      privateTextCommitted: false,
    },
    bodyStructured: {
      headings: (template.bodyStructured?.headings || []).slice(0, 8),
      text: "[Synthetic/redacted demo metadata only. No private form text.]",
    },
    reviewStatus: "approved",
    classificationStatus: "review_approved",
    activeInRouting: true,
    routingActiveInDemo: true,
    demoFixture: true,
    legalKnowledgeNodeIds: [
      `forms_demo.${template.practiceArea || "general"}.${String(template.documentIntent || "document").toLowerCase()}`,
      `workflow.${String(template.proceduralStage || "stage").toLowerCase()}`,
    ],
    reviewerDecision: {
      status: "approved",
      reviewer: "synthetic-demo-reviewer",
      reviewedAt: "2026-07-06T00:00:00.000Z",
      comment: "Synthetic/redacted approved-demo subset only.",
      approvedValues: {
        practiceArea: template.practiceArea,
        documentIntent: template.documentIntent,
        proceduralStage: template.proceduralStage,
      },
    },
  };
}

function redactClause(clause, ordinal) {
  return {
    ...clause,
    text: `[Synthetic approved demo clause ${ordinal}: ${clause.clauseType}. No private form text.]`,
    normalizedText: `synthetic approved demo clause ${ordinal} ${String(clause.clauseType || "").toLowerCase()}`,
    sourceLocation: {
      source: "synthetic_redacted_demo_metadata",
      ordinal,
      privateTextCommitted: false,
    },
    lawyerReviewStatus: "approved_demo",
    reviewStatus: "approved",
    legalKnowledgeNodeIds: [
      `forms_demo.${String(clause.documentIntent || "document").toLowerCase()}.${String(clause.clauseType || "clause").toLowerCase()}`,
    ],
    notebooklmUsageNoteIds: [],
    notebooklmUsageLinks: [],
  };
}

function buildSubset() {
  const source = loadSyntheticStore();
  const templates = (source.templates || [])
    .filter(template => APPROVED_INTENTS.has(template.documentIntent))
    .slice(0, 3)
    .map(approveTemplate);
  const templateIds = new Set(templates.map(template => template.id));
  const clauses = (source.clauses || [])
    .filter(clause => templateIds.has(clause.templateId) && CLAUSE_TYPES.has(clause.clauseType))
    .slice(0, 9)
    .map(redactClause);
  const clauseIds = new Set(clauses.map(clause => clause.id));
  const templatesWithClauses = templates.map(template => ({
    ...template,
    clauseIds: (template.clauseIds || []).filter(id => clauseIds.has(id)),
  }));
  const usageRules = (source.usageRules || [])
    .filter(rule => clauseIds.has(rule.clauseId))
    .map(rule => ({ ...rule, reviewStatus: "approved" }));
  const classificationReviews = templatesWithClauses.map(template => ({
    id: template.classificationReviewId,
    templateId: template.id,
    firmId: template.firmId,
    workspaceId: template.workspaceId,
    proposed: {
      practiceArea: template.practiceArea,
      documentIntent: template.documentIntent,
      proceduralStage: template.proceduralStage,
      matterTypes: template.applicableMatterTypes || [],
      prerequisites: template.prerequisites || [],
      contraindications: template.contraindications || [],
    },
    extractionTrace: {
      method: "synthetic_redacted_demo_review",
      confidence: 1,
      caveat: "Approved only for the synthetic/redacted demo subset.",
    },
    classificationStatus: "review_approved",
    reviewStatus: "approved",
    reviewerDecision: template.reviewerDecision,
  }));
  const store = {
    formPack: {
      ...source.formPack,
      id: "pack_forms_approved_demo_subset",
      sourcePackName: "Approved Synthetic PI Demo Subset",
      sourceLicenseNote: "Synthetic/redacted metadata only; no private form text.",
      uploadHash: "synthetic-redacted-approved-demo",
      reviewStatus: "approved_demo",
    },
    templates: templatesWithClauses,
    classificationReviews,
    clauses,
    usageRules,
    notebooklmUsageNotes: [],
    routingRules: defaultFormRoutingRules(),
  };
  store.privateFormIndex = buildPrivateFormIndex(store);
  writePrivateFormStore(OUTPUT_DIR, store);
  return store;
}

function markdown(report) {
  return `# Approved Forms Demo Subset Report

Generated: ${report.generated_at}

This committed subset is synthetic/redacted metadata only. It proves the approval workflow and routing gates without committing private/licensed form text.

| Metric | Count |
|---|---:|
| Approved PI templates | ${report.approved_templates} |
| Approved clauses | ${report.approved_clauses} |
| Approved usage rules | ${report.approved_usage_rules} |
| Classification reviews | ${report.classification_reviews} |

## Included Intents

${Object.entries(report.document_intent_distribution).map(([k, v]) => `- ${k}: ${v}`).join("\n")}

## Routing Fixture

- Approved demo templates are active in routing.
- Machine-candidate real/private templates remain inactive by default.
- Clause text is synthetic/redacted and carries \`privateTextCommitted=false\`.
`;
}

function run() {
  ensureArtifactsDir();
  const store = buildSubset();
  const report = {
    report_id: "forms_approved_demo_subset",
    generated_at: "2026-07-06T00:00:00.000Z",
    status: "approved_synthetic_redacted_demo_subset_ready",
    output_dir: "fixtures/forms/approved_demo_subset_store",
    private_text_committed: false,
    approved_templates: store.templates.length,
    approved_clauses: store.clauses.length,
    approved_usage_rules: store.usageRules.length,
    classification_reviews: store.classificationReviews.length,
    document_intent_distribution: store.templates.reduce((acc, template) => {
      acc[template.documentIntent] = (acc[template.documentIntent] || 0) + 1;
      return acc;
    }, {}),
    stage_distribution: store.templates.reduce((acc, template) => {
      acc[template.proceduralStage] = (acc[template.proceduralStage] || 0) + 1;
      return acc;
    }, {}),
  };
  writeJson(REPORT_JSON, report);
  require("fs").writeFileSync(REPORT_MD, markdown(report));
  console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) run();

module.exports = {
  buildSubset,
};
