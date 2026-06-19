const SIGNIFICANCE_LABELS = new Set([
  "states_rule",
  "applies_rule",
  "distinguishes_rule",
  "limits_rule",
  "sets_out_test",
  "illustrates_fact_pattern",
  "explains_procedure",
  "not_authority_party_argument",
  "procedural_history_only",
  "irrelevant",
]);

const AUTHORITY_ROLES = new Set([
  "ratio",
  "obiter",
  "application",
  "party_submission",
  "procedural_background",
  "unknown",
]);

const CONFIDENCE = new Set(["high", "medium", "low"]);
const REVIEW_STATES = new Set(["machine_candidate", "quote_verified", "source_verified", "lawyer_reviewed", "answer_safe", "rejected"]);

function cleanString(value) {
  return String(value || "").trim();
}

function propositionCard(input = {}) {
  const reviewState = REVIEW_STATES.has(input.review_state) ? input.review_state : "machine_candidate";
  return {
    proposition_id: cleanString(input.proposition_id),
    case_id: cleanString(input.case_id),
    paragraph_id: cleanString(input.paragraph_id),
    source_paragraph: cleanString(input.source_paragraph || input.paragraph_no),
    exact_quote: cleanString(input.exact_quote),
    proposition_text: cleanString(input.proposition_text),
    tree_node_ids: Array.isArray(input.tree_node_ids) ? input.tree_node_ids.map(cleanString).filter(Boolean) : [],
    significance_label: SIGNIFICANCE_LABELS.has(input.significance_label) ? input.significance_label : "irrelevant",
    authority_role: AUTHORITY_ROLES.has(input.authority_role) ? input.authority_role : "unknown",
    confidence: CONFIDENCE.has(input.confidence) ? input.confidence : "low",
    review_state: reviewState,
    answer_safe: input.answer_safe === true || reviewState === "answer_safe",
    human_review_required: input.human_review_required !== false && reviewState !== "answer_safe",
    source_visibility: cleanString(input.source_visibility || "public_demo"),
    tenant_id: cleanString(input.tenant_id || "public"),
    fixture_status: cleanString(input.fixture_status),
    authority_status: cleanString(input.authority_status),
  };
}

function validatePropositionCard(card = {}, paragraphById = new Map(), nodeIds = new Set()) {
  const errors = [];
  for (const field of ["proposition_id", "case_id", "paragraph_id", "source_paragraph", "exact_quote", "proposition_text", "significance_label", "authority_role", "confidence", "review_state"]) {
    if (!card[field]) errors.push(`proposition_card_missing_${field}`);
  }
  if (!SIGNIFICANCE_LABELS.has(card.significance_label)) errors.push(`invalid_significance_label:${card.significance_label}`);
  if (!AUTHORITY_ROLES.has(card.authority_role)) errors.push(`invalid_authority_role:${card.authority_role}`);
  if (!REVIEW_STATES.has(card.review_state)) errors.push(`invalid_review_state:${card.review_state}`);
  if (card.source_visibility !== "public_demo") errors.push("proposition_card_must_be_public_demo");
  if (card.tenant_id !== "public") errors.push("proposition_card_must_use_public_tenant");
  if (card.authority_role === "party_submission" && ["states_rule", "sets_out_test"].includes(card.significance_label)) {
    errors.push("party_submission_cannot_state_rule");
  }
  if (["procedural_background", "party_submission"].includes(card.authority_role) && card.answer_safe) {
    errors.push("non_authority_role_cannot_be_answer_safe");
  }
  if (card.review_state === "answer_safe" && card.human_review_required) {
    errors.push("answer_safe_should_not_require_human_review");
  }
  if (card.answer_safe && card.review_state !== "answer_safe") {
    errors.push("answer_safe_requires_answer_safe_review_state");
  }
  const paragraph = paragraphById.get(card.paragraph_id);
  if (paragraph && !paragraph.text.includes(card.exact_quote)) {
    errors.push("exact_quote_not_found_in_paragraph");
  }
  for (const nodeId of card.tree_node_ids || []) {
    if (nodeIds.size && !nodeIds.has(nodeId) && nodeId !== "unattached") {
      errors.push(`unknown_tree_node:${nodeId}`);
    }
  }
  if ((!card.tree_node_ids || card.tree_node_ids.length === 0) && card.significance_label !== "irrelevant") {
    errors.push("non_irrelevant_proposition_requires_tree_node");
  }
  return errors;
}

module.exports = {
  AUTHORITY_ROLES,
  CONFIDENCE,
  REVIEW_STATES,
  SIGNIFICANCE_LABELS,
  propositionCard,
  validatePropositionCard,
};
