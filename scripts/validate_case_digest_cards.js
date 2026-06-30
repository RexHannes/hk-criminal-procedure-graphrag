#!/usr/bin/env node
/* Validate L3.5 issue-mapped case digest cards. */

const {
  PATHS,
  readJsonl,
  byId,
} = require("../src/legal_answer/case_corpus/case_corpus_store");

const paragraphs = readJsonl(PATHS.paragraphsSample);
const propositions = readJsonl(PATHS.propositionsSample);
const principles = readJsonl(PATHS.principlesSample);
const digests = readJsonl(PATHS.digestsSample);
const paragraphById = byId(paragraphs, "paragraph_id");
const propositionById = byId(propositions, "proposition_id");
const principleById = byId(principles, "principle_id");
const errors = [];
const minCasesIndex = process.argv.indexOf("--min-cases");
const minCases = Number(minCasesIndex >= 0 ? process.argv[minCasesIndex + 1] : "25");

function assert(condition, message) {
  if (!condition) errors.push(message);
}

const ids = new Set();
assert(digests.length >= minCases, `digests contain fewer than ${minCases} case(s)`);
for (const digest of digests) {
  assert(digest.case_digest_card_id && !ids.has(digest.case_digest_card_id), `${digest.case_digest_card_id}: missing/duplicate digest id`);
  ids.add(digest.case_digest_card_id);
  assert(digest.case_id, `${digest.case_digest_card_id}: missing case_id`);
  assert(digest.case_name && digest.neutral_citation, `${digest.case_digest_card_id}: missing case identity`);
  assert(digest.facts_summary && digest.procedural_history, `${digest.case_digest_card_id}: missing facts/procedural history`);
  assert((digest.issues || []).length >= 1, `${digest.case_digest_card_id}: missing issues`);
  assert((digest.holdings || []).length >= 1, `${digest.case_digest_card_id}: missing holdings`);
  for (const paragraphId of digest.key_paragraphs || []) {
    assert(paragraphById.has(paragraphId), `${digest.case_digest_card_id}: key paragraph missing ${paragraphId}`);
  }
  for (const propId of digest.proposition_ids || []) {
    assert(propositionById.has(propId), `${digest.case_digest_card_id}: proposition link missing ${propId}`);
  }
  for (const principleId of digest.principle_ids || []) {
    assert(principleById.has(principleId), `${digest.case_digest_card_id}: principle link missing ${principleId}`);
  }
  for (const principleId of digest.ratio_principles || []) {
    assert(principleById.has(principleId), `${digest.case_digest_card_id}: ratio principle missing ${principleId}`);
  }
  for (const url of digest.hklii_paragraph_urls || []) {
    assert(/#p\d+/i.test(url), `${digest.case_digest_card_id}: paragraph URL lacks #p anchor`);
  }
  assert(digest.answer_layer_status === "research_only", `${digest.case_digest_card_id}: must be research_only`);
  assert(digest.review_status === "lawyer_review_required", `${digest.case_digest_card_id}: must require lawyer review`);
  assert(digest.answer_layer_status !== "answer_safe", `${digest.case_digest_card_id}: digest cannot be answer_safe`);
  assert(digest.treatment?.current_treatment_status === "unchecked", `${digest.case_digest_card_id}: treatment should default unchecked`);
  assert(!/case_recall_only|placeholder|todo/i.test(JSON.stringify(digest)), `${digest.case_digest_card_id}: recall-only/placeholder marker present`);
}

if (errors.length) {
  console.error("Case digest card validation failed:");
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log(JSON.stringify({
  validator: "validate_case_digest_cards",
  mode: process.argv.includes("--sample") ? "sample" : "default",
  case_digest_card_count: digests.length,
  status: "passed",
}, null, 2));
