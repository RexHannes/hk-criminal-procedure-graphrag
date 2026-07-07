function documentRecord(item, kind = "recommended") {
  const template = item.template || item;
  const caveats = item.caveats || item.reasons || item.blockedBy || [];
  const missingFacts = caveats.map(c => c.missingFact).filter(Boolean);
  return {
    linkedPrivateTemplateId: template.id || item.templateId || "",
    title: template.title || item.title || "",
    documentIntent: template.documentIntent || item.documentIntent || "",
    workflowStage: template.proceduralStage || item.workflowStage || "",
    whyRelevant: kind === "blocked" ? "Structured gates block this document on current facts." : "Structured filters match matter facts, lane, stage, and document intent.",
    requiredFacts: template.prerequisites || [],
    missingFacts,
    draftability: caveats.some(c => c.severity === "placeholder_only") ? "placeholder_only" : kind === "blocked" ? "blocked" : "draftable_metadata_only",
    finalisationBlockers: caveats.map(c => c.reason || c.gateId || "blocked"),
    linkedUsageRuleIds: template.usageRuleIds || [],
    lawyerReviewRequired: template.reviewStatus !== "approved",
    privateTextCommitted: false,
  };
}

function composeDocumentaryFlow({ recallResult, matter = {} }) {
  const recommendedDocuments = (recallResult.recommended || recallResult.recommendedForms || []).map(item => documentRecord(item));
  const blockedDocuments = (recallResult.blocked || recallResult.blockedForms || []).map(item => documentRecord(item, "blocked"));
  const placeholderOnlyDocuments = recommendedDocuments.filter(doc => doc.draftability === "placeholder_only");
  const draftableDocuments = recommendedDocuments.filter(doc => doc.draftability === "draftable_metadata_only");
  const missingCrucialInformation = Array.from(new Set([
    ...(recallResult.missingFacts || []),
    ...recommendedDocuments.flatMap(doc => doc.missingFacts || []),
  ]));
  const requiredEvidence = Array.from(new Set(recallResult.requiredEvidence || []));
  return {
    documentaryFlow: {
      matterSummary: {
        practiceLane: matter.practiceLane || matter.practiceArea || "",
        matterType: matter.matterType || "",
        workflowStage: matter.workflowStage || "",
        clientRole: matter.clientRole || "",
      },
      recommendedDocuments,
      blockedDocuments,
      draftableDocuments,
      placeholderOnlyDocuments,
      missingCrucialInformation,
      requiredEvidence,
      recommendedNextActions: [
        ...missingCrucialInformation.map(item => `Ask for missing fact: ${item}`),
        ...requiredEvidence.map(item => `Collect evidence: ${item}`),
      ],
      reviewGates: [
        "private_forms_are_template_metadata_not_public_authority",
        "lawyer_review_required_before_final_document_output",
      ],
      provenance: ["TEMPLATE_BASED", "FIRM_SOP", "AI_SUGGESTED"],
      privateTextCommitted: false,
    },
  };
}

module.exports = {
  composeDocumentaryFlow,
};
