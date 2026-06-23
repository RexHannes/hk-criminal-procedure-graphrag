#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const BATCH_DIR = path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "bail_public_batch_v1");
const PACKET = path.join(BATCH_DIR, "answer_safe_review_packet.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

const packet = readJson(PACKET);
const paragraphPayload = readJson(path.join(BATCH_DIR, "paragraph_cards.json"));
const paragraphById = new Map((paragraphPayload.paragraph_cards || []).map(item => [item.paragraph_id, item]));
const errors = [];

assert(packet.packet_id === "bail_answer_safe_review_packet_v1", "unexpected review packet id", errors);
assert(packet.review_policy?.auto_promotion_allowed === false, "review packet must not allow auto-promotion", errors);
assert(packet.review_policy?.minimum_gold_set_for_20k_gate === 3, "review packet must document 3-card gold-set gate", errors);
assert((packet.candidates || []).length >= 3, "review packet should include at least three candidates", errors);

for (const candidate of packet.candidates || []) {
  const paragraph = paragraphById.get(candidate.paragraph_id);
  assert(candidate.court_level === "CFA", `${candidate.proposition_id}: first answer-safe packet should use CFA candidates`, errors);
  assert(candidate.authority_role === "ratio", `${candidate.proposition_id}: first answer-safe packet should use ratio candidates`, errors);
  assert(candidate.current_answer_safe === false, `${candidate.proposition_id}: packet must not pre-approve answer_safe`, errors);
  assert(paragraph && paragraph.text.includes(candidate.exact_quote), `${candidate.proposition_id}: exact quote missing from paragraph`, errors);
  assert(Array.isArray(candidate.required_human_checks) && candidate.required_human_checks.length >= 5, `${candidate.proposition_id}: human checks missing`, errors);
}

if (errors.length) {
  console.error("Bail answer-safe review packet validation failed:");
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`Bail answer-safe review packet validation passed: ${packet.candidates.length} candidates.`);
