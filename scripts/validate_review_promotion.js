#!/usr/bin/env node
/* eslint-disable no-console */

const { promoteCard, validatePromotion } = require("../src/legal_answer/review/promotion");

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

const errors = [];
const sourceText = "The court may stay proceedings as an abuse of process.";
const base = {
  proposition_id: "prop_test",
  verification_status: "machine_candidate",
  answer_layer_status: "machine_candidate",
  review_status: "lawyer_review_required",
  citation: "[2026] HKCFI 1",
  pinpoint: "para 1",
  supporting_quote: "stay proceedings as an abuse of process",
  authority_role: "applied_principle",
};

const quoteVerified = promoteCard(base, "quote_verified", { sourceText });
assert(quoteVerified.verification_status === "quote_verified", "quote_verified transition failed", errors);
const sourceVerified = promoteCard({ ...quoteVerified, answer_layer_status: "quote_verified" }, "source_verified");
assert(sourceVerified.verification_status === "source_verified", "source_verified transition failed", errors);
const reviewed = promoteCard({ ...sourceVerified, answer_layer_status: "source_verified" }, "lawyer_reviewed", { reviewer: "reviewer@example.com" });
assert(reviewed.answer_layer_status === "lawyer_reviewed", "lawyer_reviewed transition failed", errors);
const answerSafe = promoteCard(reviewed, "answer_safe", { reviewer: "reviewer@example.com", note: "Approved for demo rule support." });
assert(answerSafe.answer_layer_status === "answer_safe", "answer_safe transition failed", errors);
assert(answerSafe.review_status === "approved", "answer_safe must be approved", errors);
assert(answerSafe.promotion_audit.length >= 2, "promotion audit missing", errors);

assert(validatePromotion(base, "answer_safe", { reviewer: "r" }).some(error => error.includes("prior lawyer_reviewed")), "answer_safe must require prior lawyer_reviewed", errors);
assert(validatePromotion({ ...base, authority_role: "party_argument", answer_layer_status: "lawyer_reviewed" }, "answer_safe", { reviewer: "r", note: "n" }).some(error => error.includes("party_argument")), "party_argument must not become answer_safe", errors);
assert(validatePromotion(base, "quote_verified", { sourceText: "different text" }).some(error => error.includes("exact supporting_quote")), "quote verification must be exact", errors);

if (errors.length) {
  console.error("Review promotion validation failed:");
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log("Review promotion validation passed.");
