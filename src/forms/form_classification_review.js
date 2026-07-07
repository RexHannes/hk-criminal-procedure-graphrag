const crypto = require("crypto");

const CLASSIFICATION_STATUS = {
  MACHINE_CANDIDATE: "machine_candidate",
  REVIEW_APPROVED: "review_approved",
  REJECTED: "rejected",
};

const REVIEW_STATUS = {
  LAWYER_REQUIRED: "lawyer_review_required",
  APPROVED: "approved",
  REJECTED: "rejected",
};

function hashText(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function reviewIdForTemplate(template) {
  return `classification_review_${hashText([
    template.id,
    template.practiceArea,
    template.documentIntent,
    template.proceduralStage,
  ].join("|")).slice(0, 12)}`;
}

function extractionTraceForTemplate(template, doc = {}) {
  return {
    method: "regex_keyword_machine_extraction",
    sourceFileRef: template.sourceFileRef || doc.fileRef || null,
    titleSignals: [template.title].filter(Boolean),
    proposedFromText: true,
    confidence: 0.72,
    caveat: "Machine classification only. It is not lawyer-approved until a reviewer decision is recorded.",
  };
}

function buildClassificationReview(template, doc = {}) {
  return {
    id: reviewIdForTemplate(template),
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
    extractionTrace: extractionTraceForTemplate(template, doc),
    classificationStatus: CLASSIFICATION_STATUS.MACHINE_CANDIDATE,
    reviewStatus: REVIEW_STATUS.LAWYER_REQUIRED,
    reviewerDecision: {
      status: "pending",
      reviewer: "",
      reviewedAt: "",
      comment: "",
      approvedValues: null,
    },
  };
}

function isTemplateActiveForRouting(template, options = {}) {
  if (!template) return false;
  if (template.reviewStatus === REVIEW_STATUS.REJECTED || template.classificationStatus === CLASSIFICATION_STATUS.REJECTED) return false;
  if (template.reviewStatus === REVIEW_STATUS.APPROVED || template.classificationStatus === CLASSIFICATION_STATUS.REVIEW_APPROVED) return true;
  if (template.demoFixture === true || template.routingActiveInDemo === true || options.allowDemoCandidates === true) return true;
  return false;
}

module.exports = {
  CLASSIFICATION_STATUS,
  REVIEW_STATUS,
  buildClassificationReview,
  isTemplateActiveForRouting,
};
