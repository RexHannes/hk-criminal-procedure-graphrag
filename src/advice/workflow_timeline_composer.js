function timelineRow({ rowId, part, stage, task, owner, dependencyIds = [], status, exportCategory, documentIntent = "", templateId = "" }) {
  return {
    rowId,
    part,
    stage,
    task,
    owner,
    dueDate: null,
    dependencyIds,
    status,
    exportCategory,
    documentIntent,
    templateId,
    privateTextCommitted: false,
  };
}

function composeWorkflowTimeline({ part1LegalAnalysis = {}, documentaryFlow = {} }) {
  const rows = [
    timelineRow({
      rowId: "crm_001",
      part: "Part 1",
      stage: "LEGAL_ANALYSIS",
      task: "Review source-backed legal issue classification",
      owner: "lawyer",
      status: part1LegalAnalysis.status || "research_required",
      exportCategory: "legal_analysis",
    }),
  ];
  let seq = 2;
  const docs = [
    ...(documentaryFlow.recommendedDocuments || []),
    ...(documentaryFlow.blockedDocuments || []),
  ];
  for (const doc of docs) {
    const blocked = doc.draftability === "blocked" || (doc.finalisationBlockers || []).length > 0;
    rows.push(timelineRow({
      rowId: `crm_${String(seq).padStart(3, "0")}`,
      part: "Part 2",
      stage: doc.workflowStage || "DOCUMENTARY_FLOW",
      task: blocked ? `Resolve blockers for ${doc.title}` : `Prepare ${doc.title}`,
      owner: blocked ? "lawyer" : "paralegal",
      dependencyIds: ["crm_001"],
      status: blocked ? "blocked_missing_information" : "candidate_action",
      exportCategory: "documentary_flow",
      documentIntent: doc.documentIntent,
      templateId: doc.linkedPrivateTemplateId,
    }));
    seq += 1;
  }
  rows.push(timelineRow({
    rowId: `crm_${String(seq).padStart(3, "0")}`,
    part: "Part 3",
    stage: "CRM_EXPORT",
    task: "Export matter workflow timeline",
    owner: "operations",
    dependencyIds: rows.slice(1).map(row => row.rowId),
    status: "ready_for_crm_mapping",
    exportCategory: "crm_export",
  }));
  return {
    timeline: rows,
    privateTextCommitted: false,
    professionalAdviceCertified: false,
  };
}

module.exports = {
  composeWorkflowTimeline,
};
