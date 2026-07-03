function researchPrototypeMetadata(overrides = {}) {
  return {
    source_status: "paragraph_linked_public_source",
    research_use_allowed: true,
    lawyer_review_status: "unreviewed",
    lawyer_review_required: false,
    answer_mode: "research_prototype",
    professional_advice_certified: false,
    answer_safe: false,
    ...overrides,
  };
}

function attachResearchPrototypeMetadata(record = {}) {
  return {
    ...record,
    ...researchPrototypeMetadata(),
    human_review_status: record.human_review_status || "unreviewed",
  };
}

function isParagraphLinkedPublicSource(record = {}) {
  return record.source_status === "paragraph_linked_public_source" && record.research_use_allowed === true;
}

module.exports = {
  researchPrototypeMetadata,
  attachResearchPrototypeMetadata,
  isParagraphLinkedPublicSource,
};
