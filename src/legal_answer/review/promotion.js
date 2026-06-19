const REVIEW_STATES = [
  "machine_candidate",
  "quote_verified",
  "source_verified",
  "lawyer_reviewed",
  "answer_safe",
  "rejected",
];

const ALLOWED_TRANSITIONS = new Map([
  ["machine_candidate", new Set(["quote_verified", "rejected"])],
  ["quote_verified", new Set(["source_verified", "rejected"])],
  ["source_verified", new Set(["lawyer_reviewed", "rejected"])],
  ["lawyer_reviewed", new Set(["answer_safe", "rejected"])],
  ["answer_safe", new Set(["lawyer_reviewed", "rejected"])],
  ["rejected", new Set(["machine_candidate"])],
]);

function hasCitationAndPinpoint(card = {}) {
  return Boolean(card.citation && (card.pinpoint || card.paragraph || card.section));
}

function validatePromotion(card = {}, toStatus, { sourceText = "", reviewer = "", note = "" } = {}) {
  const fromStatus = card.answer_layer_status || card.verification_status || "machine_candidate";
  const errors = [];
  if (!REVIEW_STATES.includes(toStatus)) errors.push(`unknown target status ${toStatus}`);
  if (!ALLOWED_TRANSITIONS.get(fromStatus)?.has(toStatus)) errors.push(`invalid transition ${fromStatus} -> ${toStatus}`);
  if (toStatus === "quote_verified" && (!card.supporting_quote || !sourceText.includes(card.supporting_quote))) {
    errors.push("quote_verified requires exact supporting_quote in source text");
  }
  if (["source_verified", "lawyer_reviewed", "answer_safe"].includes(toStatus) && !hasCitationAndPinpoint(card)) {
    errors.push(`${toStatus} requires citation and pinpoint`);
  }
  if (toStatus === "lawyer_reviewed" && !reviewer) errors.push("lawyer_reviewed requires reviewer");
  if (toStatus === "answer_safe") {
    if ((card.authority_role || "") === "party_argument") errors.push("party_argument cannot become answer_safe as a rule/holding");
    if (fromStatus !== "lawyer_reviewed") errors.push("answer_safe requires prior lawyer_reviewed status");
    if (!reviewer) errors.push("answer_safe requires reviewer");
    if (!note) errors.push("answer_safe requires review note");
  }
  return errors;
}

function promoteCard(card = {}, toStatus, options = {}) {
  const errors = validatePromotion(card, toStatus, options);
  if (errors.length) {
    const error = new Error("promotion_validation_failed");
    error.errors = errors;
    throw error;
  }
  const now = options.reviewedAt || new Date().toISOString();
  return {
    ...card,
    previous_status: card.answer_layer_status || card.verification_status || "machine_candidate",
    verification_status: ["quote_verified", "source_verified"].includes(toStatus) ? toStatus : card.verification_status,
    answer_layer_status: toStatus === "answer_safe" ? "answer_safe" : toStatus === "lawyer_reviewed" ? "lawyer_reviewed" : card.answer_layer_status || "research_only",
    review_status: ["lawyer_reviewed", "answer_safe"].includes(toStatus) ? "approved" : card.review_status || "lawyer_review_required",
    reviewed_by: options.reviewer || card.reviewed_by || "",
    reviewed_at: now,
    review_note: options.note || card.review_note || "",
    promotion_audit: [
      ...(card.promotion_audit || []),
      {
        previous_status: card.answer_layer_status || card.verification_status || "machine_candidate",
        new_status: toStatus,
        reviewed_by: options.reviewer || "",
        reviewed_at: now,
        review_note: options.note || "",
      },
    ],
  };
}

module.exports = {
  ALLOWED_TRANSITIONS,
  REVIEW_STATES,
  promoteCard,
  validatePromotion,
};
