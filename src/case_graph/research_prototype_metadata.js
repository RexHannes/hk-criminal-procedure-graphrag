const CLEAN_PRODUCT_LABELS = [
  "Source-linked",
  "Public judgment",
  "Paragraph proof",
  "Research prototype",
];

const RESEARCH_PROTOTYPE_METADATA = {
  answer_mode: "research_prototype",
  lawyer_review_status: "unreviewed",
  professional_advice_certified: false,
  public_source_link_required: true,
  lawyer_review_blocks_research_prototype: false,
};

function applyResearchPrototypeMetadata(item = {}) {
  return {
    ...item,
    answer_mode: "research_prototype",
    lawyer_review_status: item.lawyer_review_status || "unreviewed",
    professional_advice_certified: false,
    public_source_link_verified: item.public_source_link_verified !== false,
  };
}

module.exports = {
  CLEAN_PRODUCT_LABELS,
  RESEARCH_PROTOTYPE_METADATA,
  applyResearchPrototypeMetadata,
};
