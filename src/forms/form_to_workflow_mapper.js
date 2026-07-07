const fs = require("fs");
const path = require("path");
const { classifyPracticeLane } = require("./practice_lane_classifier");

const DEFAULT_RULES_PATH = path.join(process.cwd(), "data", "forms", "default_document_flow_rules.json");

function loadDefaultDocumentFlowRules(filePath = DEFAULT_RULES_PATH) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function mappingForTemplate(template, rules = loadDefaultDocumentFlowRules()) {
  const lane = classifyPracticeLane(template);
  const byIntent = (rules.rules || []).find(rule => (
    rule.documentIntent === template.documentIntent &&
    (!rule.practiceLane || rule.practiceLane === lane.practiceLane)
  ));
  return {
    id: `flow_${template.id}`,
    templateId: template.id,
    practiceLane: lane.practiceLane,
    matterType: (template.applicableMatterTypes || [])[0] || "",
    clientRole: (template.applicableRoles || [])[0] || "",
    workflowStage: template.proceduralStage,
    documentIntent: template.documentIntent,
    preconditions: byIntent?.useWhen || template.recommendedWhen || [],
    missingFactBlockers: template.prerequisites || [],
    missingEvidenceBlockers: (template.fieldSchema || []).filter(field => field.evidenceRequired).map(field => field.fieldKey),
    wrongStageBlockers: byIntent?.wrongStageBlockers || template.blockedWhen || [],
    alternatives: byIntent?.alternatives || [],
    timelineTask: byIntent?.timelineTask || `Prepare ${template.title}`,
    crmExportCategory: byIntent?.crmExportCategory || "documentary_flow",
    reviewStatus: template.reviewStatus,
    classificationStatus: template.classificationStatus,
    privateTextCommitted: false,
  };
}

function buildMatterDocumentFlowIndex(store) {
  const flows = (store.templates || []).map(template => mappingForTemplate(template));
  return {
    indexVersion: "matter-document-flow-v1",
    privateTextCommitted: false,
    flows,
  };
}

function buildWorkflowTimelineRules(store) {
  return {
    rulesVersion: "workflow-timeline-rules-v1",
    privateTextCommitted: false,
    rules: buildMatterDocumentFlowIndex(store).flows.map(flow => ({
      id: `timeline_${flow.templateId}`,
      templateId: flow.templateId,
      practiceLane: flow.practiceLane,
      documentIntent: flow.documentIntent,
      workflowStage: flow.workflowStage,
      taskType: flow.crmExportCategory,
      taskName: flow.timelineTask,
      ownerPlaceholder: "lane-owner-placeholder",
      dueDatePlaceholder: null,
      dependencyPolicy: "after_part_1_legal_analysis",
    })),
  };
}

module.exports = {
  buildMatterDocumentFlowIndex,
  buildWorkflowTimelineRules,
  loadDefaultDocumentFlowRules,
  mappingForTemplate,
};
