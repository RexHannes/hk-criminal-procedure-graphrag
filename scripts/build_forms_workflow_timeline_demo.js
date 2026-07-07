#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const {
  buildAnswerForFormsQuestion,
  loadFormStore,
  writeJson,
} = require("../src/forms/form_system");

const STORE_DIR = path.join(process.cwd(), "fixtures", "forms", "approved_demo_subset_store");
const REPORT_JSON = path.join(process.cwd(), "artifacts", "forms_workflow_timeline_demo_report.json");
const REPORT_MD = path.join(process.cwd(), "artifacts", "forms_workflow_timeline_demo_report.md");

function buildDemo() {
  const store = loadFormStore(STORE_DIR);
  const query = "draft a letter of claim for a road traffic personal injury matter and export the workflow timeline";
  const matter = {
    practiceArea: "personal_injury",
    matterType: "road_traffic_pi",
    workflowStage: "PRE_ACTION_CORRESPONDENCE",
    clientRole: "claimant",
    injuryExists: true,
    opponentIdentified: true,
    policeReportObtained: true,
    medicalEvidenceReceived: true,
    specialDamagesEvidenceAvailable: true,
    liabilityFactsKnown: true,
    proceedingsCommenced: false,
    responseDeadlineDays: 14,
  };
  const answer = buildAnswerForFormsQuestion({ store, query, matter });
  return {
    report_id: "forms_workflow_timeline_demo",
    generated_at: "2026-07-07T00:00:00+08:00",
    status: "synthetic_redacted_timeline_ready",
    source_store: "fixtures/forms/approved_demo_subset_store",
    private_text_committed: false,
    external_services_used: false,
    professional_advice_certified: false,
    product_flow: {
      part_1: "legal analysis and source classification",
      part_2: "documentary flow, form/snippet recommendation, and missing-fact gates",
      part_3: "CRM/workflow timeline export",
    },
    query,
    current_workflow_stage: answer.currentWorkflowStage,
    recommended_form_count: answer.recommendedForms.length,
    recommended_forms: answer.recommendedForms.map(item => ({
      id: item.id,
      title: item.title,
      documentIntent: item.documentIntent,
      caveatCount: (item.caveats || []).length,
      provenanceLabel: item.provenanceLabel,
    })),
    missing_facts_evidence_blockers: answer.missingFactsEvidenceBlockers,
    source_provenance_notes: answer.sourceProvenanceNotes,
    workflow_timeline: answer.workflowTimeline,
    crm_workflow_export: answer.crmWorkflowExport,
    boundaries: {
      public_authority_analysis_separate: true,
      private_template_layer_separate: true,
      synthetic_redacted_demo_only: true,
      reviewer_permissions_not_configured: true,
    },
  };
}

function markdown(report) {
  return `# Forms Workflow Timeline Demo

Generated: ${report.generated_at}

This demo uses only the approved synthetic/redacted form subset. It proves the Part 1 -> Part 2 -> Part 3 workflow shape without committing private form text.

## Product Flow

- Part 1: ${report.product_flow.part_1}
- Part 2: ${report.product_flow.part_2}
- Part 3: ${report.product_flow.part_3}

## Summary

| Metric | Value |
|---|---:|
| Recommended forms | ${report.recommended_form_count} |
| Timeline steps | ${report.workflow_timeline.steps.length} |
| CRM export rows | ${report.crm_workflow_export.length} |
| Private text committed | ${report.private_text_committed ? "yes" : "no"} |
| Professional advice certified | ${report.professional_advice_certified ? "yes" : "no"} |

## Recommended Forms

${report.recommended_forms.map(item => `- ${item.title} (${item.documentIntent})`).join("\n")}

## Timeline Preview

${report.workflow_timeline.steps.map(step => `- ${step.part}: ${step.title} - ${step.status}`).join("\n")}

## Boundary

- Public authority analysis remains separate from private form routing.
- Private/template recommendations are a workflow layer, not source-backed legal authority.
- Reviewer permissions and private-store deployment remain future production work.
`;
}

function run() {
  const report = buildDemo();
  writeJson(REPORT_JSON, report);
  fs.writeFileSync(REPORT_MD, markdown(report));
  console.log(JSON.stringify({
    status: report.status,
    recommendedForms: report.recommended_form_count,
    timelineSteps: report.workflow_timeline.steps.length,
    crmRows: report.crm_workflow_export.length,
  }, null, 2));
}

if (require.main === module) run();

module.exports = { buildDemo };
