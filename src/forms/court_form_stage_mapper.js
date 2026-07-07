function stageForDocumentIntent(intent, fallback = "") {
  const map = {
    LETTER_OF_CLAIM: "PRE_ACTION_CORRESPONDENCE",
    DEMAND_LETTER: "PRE_ACTION_CORRESPONDENCE",
    MEDICAL_RECORDS_REQUEST: "MEDICAL_EVIDENCE",
    POLICE_REPORT_REQUEST: "URGENT_ACTIONS",
    WRIT: "COMMENCEMENT",
    ORIGINATING_SUMMONS: "COMMENCEMENT",
    STATEMENT_OF_CLAIM: "PLEADINGS",
    DEFENCE: "PLEADINGS",
    REPLY: "PLEADINGS",
    WITNESS_STATEMENT: "EVIDENCE_COLLECTION",
    EXPERT_REPORT_REQUEST: "EXPERT_EVIDENCE",
    PROBATE_APPLICATION: "PROBATE_APPLICATION",
    PROBATE_AFFIDAVIT: "EVIDENCE_COLLECTION",
    WILL_DRAFT: "DOCUMENT_DRAFTING",
    CONTRACT_AGREEMENT: "TRANSACTIONAL_DRAFTING",
    CONTRACT_CLAUSE: "TRANSACTIONAL_DRAFTING",
    LEASE_AGREEMENT: "TRANSACTIONAL_DRAFTING",
    SHAREHOLDERS_AGREEMENT: "TRANSACTIONAL_DRAFTING",
    COMPANY_WINDING_UP_PETITION: "COMPANY_WINDING_UP",
    COMPANY_COMPLIANCE_MEMO: "COMPANY_COMPLIANCE",
    REGULATORY_COMPLIANCE_NOTE: "REGULATORY_COMPLIANCE",
  };
  return map[intent] || fallback || "INTAKE";
}

function normalizeTemplateStage(template) {
  const expected = stageForDocumentIntent(template.documentIntent, template.proceduralStage);
  return {
    ...template,
    proceduralStage: template.proceduralStage || expected,
    mappedWorkflowStage: expected,
    stageMappingStatus: template.proceduralStage === expected ? "matched" : "mapped_or_review_required",
  };
}

module.exports = {
  normalizeTemplateStage,
  stageForDocumentIntent,
};
