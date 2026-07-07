const fs = require("fs");
const path = require("path");
const { buildPrivateFormIndex, loadFormStore, writeJson, writePrivateFormStore } = require("./form_system");
const { buildMatterDocumentFlowIndex, buildWorkflowTimelineRules } = require("./form_to_workflow_mapper");

function readActivationFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function activatePrivateFormsLane({ storeDir, activationFile, outputDir = storeDir }) {
  const store = loadFormStore(storeDir);
  const activation = readActivationFile(activationFile);
  const approvedIds = new Set((activation.approvedTemplateIds || []).concat((activation.decisions || [])
    .filter(item => item.review_decision === "approved" || item.status === "approved")
    .map(item => item.templateId || item.redacted_template_id)
    .filter(Boolean)));
  const templates = (store.templates || []).map(template => {
    const active = approvedIds.has(template.id);
    return active ? {
      ...template,
      reviewStatus: "approved",
      classificationStatus: "review_approved",
      activeInRouting: true,
      reviewerDecision: {
        ...(template.reviewerDecision || {}),
        status: "approved",
        reviewer: activation.reviewer || "reviewer-placeholder",
        reviewedAt: activation.reviewedAt || "2026-07-07T00:00:00+08:00",
        comment: "Activated from private metadata review file.",
      },
    } : {
      ...template,
      activeInRouting: false,
    };
  });
  const activeTemplateIds = new Set(templates.filter(t => t.activeInRouting).map(t => t.id));
  const activatedStore = {
    ...store,
    templates,
    clauses: (store.clauses || []).filter(clause => activeTemplateIds.has(clause.templateId)),
  };
  activatedStore.privateFormIndex = buildPrivateFormIndex(activatedStore);
  writePrivateFormStore(outputDir, activatedStore);
  writeJson(path.join(outputDir, "matter_document_flow_index.json"), buildMatterDocumentFlowIndex(activatedStore));
  writeJson(path.join(outputDir, "workflow_timeline_rules.json"), buildWorkflowTimelineRules(activatedStore));
  return {
    selected_lane: activation.selectedLane || activation.selected_lane || "unspecified",
    store_dir: path.relative(process.cwd(), outputDir),
    approved_count: templates.filter(t => t.activeInRouting).length,
    inactive_count: templates.filter(t => !t.activeInRouting).length,
    rejected_count: (activation.rejectedTemplateIds || []).length,
    needs_review_count: templates.filter(t => t.reviewStatus !== "approved").length,
    document_intent_distribution: countBy(templates, t => t.documentIntent),
    workflow_stage_distribution: countBy(templates, t => t.proceduralStage),
    private_text_committed: false,
  };
}

function countBy(items, keyFn) {
  return items.reduce((acc, item) => {
    const key = keyFn(item) || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

module.exports = {
  activatePrivateFormsLane,
  readActivationFile,
};
