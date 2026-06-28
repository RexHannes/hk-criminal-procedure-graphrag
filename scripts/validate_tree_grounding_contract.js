#!/usr/bin/env node
/* Validate the tree-by-tree authority grounding contract for answer-first RAG. */

const fs = require("fs");
const path = require("path");
const { loadRuleDecks } = require("../src/legal_answer/applied_analysis/rule_card_loader");
const { loadResearchCards } = require("../src/legal_answer/applied_analysis/research_card_store");

const ROOT = path.resolve(__dirname, "..");
const POLICY_PATH = path.join(ROOT, "data", "legal_ingest", "applied_answer", "future_field_answer_architecture_policy.json");
const CRIMINAL_COMPOSER_PATH = path.join(ROOT, "src", "api", "answer-composers", "criminal_law.js");
const CRIMINAL_RULE_DECK_PATH = path.join(ROOT, "data", "legal_ingest", "applied_answer", "rule_cards", "criminal_theft_shoplifting_v1.json");

const REQUIRED_PACK_ITEMS = [
  "official_statute_or_public_source_cards",
  "paragraph_level_case_cards_where_cases_are_used",
  "principle_or_proposition_cards_with_exact_quote_support",
  "rule_deck_with_source_card_ids",
  "unsupported_claim_gates",
  "answer_first_renderer_contract",
  "golden_queries",
  "ci_validator_that_blocks_recall_only_or_candidate_only_answer_authority",
];

const THEFT_EXPECTED_SOURCE_IDS = [
  "hk_cap210_s2_theft_definition",
  "hk_cap210_s3_dishonesty",
  "hk_cap210_s4_appropriation",
  "hk_cap210_s6_belonging_to_another",
  "hk_cap210_s7_intention_permanently_depriving",
  "hk_cap210_s9_theft_offence_penalty",
];

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function readJson(filePath) {
  return JSON.parse(read(filePath));
}

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

function assertFile(relativePath, errors) {
  assert(fs.existsSync(path.join(ROOT, relativePath)), `missing registered validator/file ${relativePath}`, errors);
}

function deckSourceIds(deck) {
  return Array.from(new Set((deck.legal_research_answer?.source_card_ids || [])
    .concat((deck.source_backed_rules || []).flatMap(rule => rule.source_card_ids || []))));
}

function validateRegisteredVertical(vertical, deckById, cards, errors) {
  const deck = deckById.get(vertical.rule_deck_id);
  assert(deck, `${vertical.rule_deck_id}: registered vertical has no rule deck`, errors);
  if (!deck) return;

  assert(deck.domain === vertical.domain, `${vertical.rule_deck_id}: domain mismatch`, errors);
  assert(deck.scenario === vertical.scenario, `${vertical.rule_deck_id}: scenario mismatch`, errors);
  assert(deck.subscenario === vertical.subscenario, `${vertical.rule_deck_id}: subscenario mismatch`, errors);
  assert(deck.legal_research_answer, `${vertical.rule_deck_id}: missing legal_research_answer`, errors);
  assert((deck.unsupported_claims || []).length >= 1, `${vertical.rule_deck_id}: missing unsupported-claim gate`, errors);
  assert(deck.answer_contract?.source_audit_policy === "collapsed_by_default", `${vertical.rule_deck_id}: source audit must be collapsed by default`, errors);

  for (const relativePath of [vertical.answer_first_validator, vertical.source_card_validator, vertical.golden_query_validator].filter(Boolean)) {
    assertFile(relativePath, errors);
  }

  const deckIds = new Set(deckSourceIds(deck));
  for (const sourceId of vertical.source_card_ids || []) {
    assert(cards.sourceById.has(sourceId), `${vertical.rule_deck_id}: source card artifact missing ${sourceId}`, errors);
    assert(deckIds.has(sourceId), `${vertical.rule_deck_id}: rule deck does not reference ${sourceId}`, errors);
  }
  for (const forbiddenId of vertical.forbidden_source_card_ids || []) {
    assert(!cards.sourceById.has(forbiddenId), `${vertical.rule_deck_id}: forbidden source card exists ${forbiddenId}`, errors);
    assert(!deckIds.has(forbiddenId), `${vertical.rule_deck_id}: forbidden source card referenced ${forbiddenId}`, errors);
  }
  for (const digestId of vertical.case_digest_card_ids || []) {
    const digest = cards.caseDigestById.get(digestId);
    assert(digest, `${vertical.rule_deck_id}: case digest artifact missing ${digestId}`, errors);
    assert(digest?.answer_layer_status === "research_only", `${digestId}: case digest must remain research_only`, errors);
    assert(digest?.review_status === "lawyer_review_required", `${digestId}: case digest must require lawyer review`, errors);
    assert((digest?.hklii_paragraph_urls || []).every(url => url.includes("#p")), `${digestId}: case digest lacks paragraph URL anchors`, errors);
  }
}

function validateTheftSectionConsistency(errors) {
  const composer = read(CRIMINAL_COMPOSER_PATH).toLowerCase();
  const deck = read(CRIMINAL_RULE_DECK_PATH).toLowerCase();
  const combined = `${composer}\n${deck}`;
  for (const sourceId of THEFT_EXPECTED_SOURCE_IDS) {
    assert(combined.includes(sourceId.toLowerCase()), `theft source id missing from composer/deck text: ${sourceId}`, errors);
  }
  assert(!/cap\.?\s*210[^.\n]{0,80}(section|sections|s\.?)\s*[^.\n]{0,40}\b5\b/i.test(composer), "criminal fallback composer still suggests Cap. 210 s.5 as a theft anchor", errors);
  assert(!combined.includes("cap210/s5"), "criminal theft pack references non-existent Cap. 210 s.5 URL", errors);
  assert(composer.includes("sections 2, 3, 4, 6, 7 and 9"), "criminal fallback composer must list Cap. 210 sections 2, 3, 4, 6, 7 and 9", errors);
}

function main() {
  const errors = [];
  const policy = readJson(POLICY_PATH);
  const decks = loadRuleDecks();
  const deckById = new Map(decks.map(deck => [deck.rule_deck_id, deck]));
  const cards = loadResearchCards();

  assert(policy.global_rag_claim_boundary?.status === "two_vertical_demo_only", "policy must keep two-vertical demo-only boundary", errors);
  assert(policy.global_rag_claim_boundary?.not_a_whole_system_rag_fix === true, "policy must forbid whole-system RAG claims", errors);
  for (const item of REQUIRED_PACK_ITEMS) {
    assert((policy.tree_by_tree_required_pack || []).includes(item), `tree-by-tree required pack missing ${item}`, errors);
  }

  const registeredDeckIds = new Set((policy.current_demo_verticals || []).map(vertical => vertical.rule_deck_id));
  for (const deck of decks) {
    assert(registeredDeckIds.has(deck.rule_deck_id), `${deck.rule_deck_id}: rule deck not registered in current_demo_verticals`, errors);
  }
  for (const vertical of policy.current_demo_verticals || []) {
    validateRegisteredVertical(vertical, deckById, cards, errors);
  }
  validateTheftSectionConsistency(errors);

  if (errors.length) {
    console.error("Tree grounding contract validation failed:");
    errors.forEach(error => console.error(`- ${error}`));
    process.exit(1);
  }

  console.log("Tree grounding contract validation passed.");
}

main();
