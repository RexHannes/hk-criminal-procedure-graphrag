#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { promoteReviewItem } = require("../src/review/promotion_api");

const tmpStore = path.join(os.tmpdir(), `review-store-${Date.now()}.json`);
const sourceText = "The principle is not confined to inconsistent factual allegations but applies to inconsistent positions or assumptions.";

fs.writeFileSync(tmpStore, JSON.stringify({
  items: [
    {
      item_id: "prop_test",
      item_type: "proposition_card",
      review_state: "machine_candidate",
      review_status: "lawyer_review_required",
      source_id: "source_test",
      citation: "[2026] HKCFI 1",
      pinpoint: "para 1",
      authority_role: "applied_principle",
      supporting_quote: "not confined to inconsistent factual allegations",
      audit: [],
    },
  ],
}, null, 2));

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

const errors = [];
try {
  const q = promoteReviewItem({ itemId: "prop_test", toStatus: "quote_verified", sourceText, storePath: tmpStore });
  assert(q.review_state === "quote_verified", "quote_verified transition failed", errors);
  const s = promoteReviewItem({ itemId: "prop_test", toStatus: "source_verified", storePath: tmpStore });
  assert(s.review_state === "source_verified", "source_verified transition failed", errors);
  const l = promoteReviewItem({ itemId: "prop_test", toStatus: "lawyer_reviewed", reviewer: "reviewer@example.com", storePath: tmpStore });
  assert(l.review_state === "lawyer_reviewed", "lawyer_reviewed transition failed", errors);
  const a = promoteReviewItem({ itemId: "prop_test", toStatus: "answer_safe", reviewer: "reviewer@example.com", reason: "Approved public demo proposition.", storePath: tmpStore });
  assert(a.review_state === "answer_safe", "answer_safe transition failed", errors);
  assert(a.audit.length === 4, "audit should record every promotion", errors);
} catch (error) {
  errors.push(error.message);
}

try {
  promoteReviewItem({ itemId: "missing", toStatus: "answer_safe", storePath: tmpStore });
  errors.push("missing review item should fail");
} catch {
  // expected
}

fs.unlinkSync(tmpStore);

if (errors.length) {
  console.error("Review promotion workflow validation failed:");
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log("Review promotion workflow validation passed.");
