function inferPhaseForTemplate(template) {
  const intent = template?.documentIntent || "";
  const stage = template?.proceduralStage || "";
  if (["PROBATE_APPLICATION", "COMPANY_WINDING_UP_PETITION", "WRIT", "ORIGINATING_SUMMONS"].includes(intent)) return "part_2_documentary_action";
  if (["CONTRACT_AGREEMENT", "CONTRACT_CLAUSE", "LEASE_AGREEMENT", "SHAREHOLDERS_AGREEMENT", "WILL_DRAFT"].includes(intent)) return "part_2_drafting";
  if (["COMPANY_COMPLIANCE_MEMO", "REGULATORY_COMPLIANCE_NOTE"].includes(intent)) return "part_1_legal_analysis";
  if (stage === "TRIAL_PREPARATION" || stage === "TRIAL") return "part_3_litigation_timeline";
  return "part_2_documentary_flow";
}

function buildFormWorkflowTimeline({ route = {}, matter = {}, query = "" } = {}) {
  const recommended = route.recommendedForms || [];
  const blocked = route.blockedForms || [];
  const missingFacts = route.missingFacts || [];
  const requiredEvidence = route.requiredEvidence || [];
  const steps = [];
  steps.push({
    stepId: "part1_legal_analysis",
    part: "Part 1",
    title: "Legal analysis and source classification",
    status: "research_required",
    actionType: "legal_analysis",
    description: "Identify issues, source authority requirements, missing facts, and route constraints before selecting documents.",
    blockers: missingFacts.map(item => `Missing fact: ${item}`),
  });
  for (const item of recommended) {
    const template = item.template;
    steps.push({
      stepId: `part2_${template.id}`,
      part: "Part 2",
      title: template.title,
      status: (item.caveats || []).some(c => c.severity === "block_finalisation") ? "draft_only" : "candidate_action",
      actionType: inferPhaseForTemplate(template),
      documentIntent: template.documentIntent,
      proceduralStage: template.proceduralStage,
      reviewStatus: template.reviewStatus,
      classificationStatus: template.classificationStatus,
      blockers: (item.caveats || []).map(c => c.reason || c.gateId).filter(Boolean),
    });
  }
  for (const item of blocked) {
    const template = item.template;
    steps.push({
      stepId: `blocked_${template.id}`,
      part: "Part 2",
      title: template.title,
      status: "blocked",
      actionType: inferPhaseForTemplate(template),
      documentIntent: template.documentIntent,
      proceduralStage: template.proceduralStage,
      reviewStatus: template.reviewStatus,
      classificationStatus: template.classificationStatus,
      blockers: (item.blockedBy || []).map(c => c.reason || c.gateId).filter(Boolean),
    });
  }
  steps.push({
    stepId: "part3_crm_timeline_export",
    part: "Part 3",
    title: "Export workflow timeline",
    status: "ready_for_crm_mapping",
    actionType: "crm_timeline_export",
    description: "Export legal-analysis, documentary-action, and litigation/deadline steps to a CRM/workflow system.",
    blockers: requiredEvidence.map(item => `Evidence required: ${item}`),
  });
  return {
    query,
    matterType: matter.matterType || matter.practiceArea || "",
    professionalAdviceCertified: false,
    exportFormat: "crm_workflow_v0",
    steps,
  };
}

function crmExportRowsFromTimeline(timeline) {
  return (timeline.steps || []).map((step, index) => ({
    rowId: `crm_${String(index + 1).padStart(3, "0")}`,
    sequence: index + 1,
    part: step.part,
    taskName: step.title,
    taskType: step.actionType,
    status: step.status,
    documentIntent: step.documentIntent || "",
    proceduralStage: step.proceduralStage || "",
    blockers: step.blockers || [],
    professionalAdviceCertified: false,
  }));
}

module.exports = {
  buildFormWorkflowTimeline,
  crmExportRowsFromTimeline,
};
