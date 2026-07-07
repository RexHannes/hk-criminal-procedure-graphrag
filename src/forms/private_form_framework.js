const { routeForms } = require("./form_system");
const { buildMatterDocumentFlowIndex, buildWorkflowTimelineRules } = require("./form_to_workflow_mapper");

function unique(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function summarizeTemplate(template) {
  return {
    templateId: template.id,
    documentIntent: template.documentIntent,
    practiceLane: template.subPracticeArea || template.practiceLane || template.practiceArea || "",
    workflowStage: template.proceduralStage,
    clientRoles: template.applicableRoles || [],
    matterTypes: template.applicableMatterTypes || [],
    prerequisites: template.prerequisites || [],
    doNotUseWhen: template.contraindications || [],
    blockers: template.blockedWhen || [],
    alternatives: [],
    reviewStatus: template.reviewStatus,
    classificationStatus: template.classificationStatus,
    privateTextCommitted: false,
  };
}

function buildPrivateFormFramework({ store, matter = {}, query = "", documentIntent = "", workflowStage = "" }) {
  const route = routeForms({ store, matter, query, documentIntent, workflowStage });
  const flowIndex = buildMatterDocumentFlowIndex(store);
  const timelineRules = buildWorkflowTimelineRules(store);
  const templateIds = new Set([
    ...route.recommendedForms.map(item => item.template.id),
    ...route.blockedForms.map(item => item.template.id),
  ]);
  const flows = flowIndex.flows.filter(flow => templateIds.has(flow.templateId));
  const templates = [
    ...route.recommendedForms.map(item => item.template),
    ...route.blockedForms.map(item => item.template),
  ];
  return {
    frameworkVersion: "private-form-framework-v1",
    formsMode: "private-form-framework",
    publicAuthority: false,
    partLayer: "part_2_forms",
    privateTextCommitted: false,
    notebooklmRuntimeEngine: false,
    notebooklmProvenance: "INTERNAL_USAGE_NOTE",
    query,
    matterSummary: {
      practiceArea: matter.practiceArea || "",
      practiceLane: matter.practiceLane || matter.subPracticeArea || "",
      matterType: matter.matterType || "",
      clientRole: matter.clientRole || "",
      workflowStage: workflowStage || matter.workflowStage || "",
      documentIntent: documentIntent || matter.documentIntent || "",
    },
    formFamilies: templates.map(summarizeTemplate),
    practicalSteps: [
      ...unique(route.missingFacts).map(item => ({ stepType: "ask_missing_fact", fact: item })),
      ...unique(route.requiredEvidence).map(item => ({ stepType: "collect_evidence", evidence: item })),
      ...route.alternativeForms.map(item => ({ stepType: "consider_alternative_form", documentIntent: item.documentIntent, reason: item.reason })),
    ],
    doNotUseWhen: unique(templates.flatMap(template => template.contraindications || [])),
    alternatives: unique(route.alternativeForms.map(item => item.documentIntent)),
    flowMappings: flows.map(flow => ({
      templateId: flow.templateId,
      workflowStage: flow.workflowStage,
      documentIntent: flow.documentIntent,
      timelineTask: flow.timelineTask,
      missingFactBlockers: flow.missingFactBlockers || [],
      wrongStageBlockers: flow.wrongStageBlockers || [],
      alternatives: flow.alternatives || [],
      privateTextCommitted: false,
    })),
    timelineTasks: timelineRules.rules
      .filter(rule => templateIds.has(rule.templateId))
      .map(rule => ({
        templateId: rule.templateId,
        taskName: rule.taskName,
        workflowStage: rule.workflowStage,
        dependencyPolicy: rule.dependencyPolicy,
      })),
    mismatchPolicy: "report_only_no_auto_fix_no_approval",
  };
}

module.exports = {
  buildPrivateFormFramework,
};
