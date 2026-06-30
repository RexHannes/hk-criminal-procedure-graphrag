#!/usr/bin/env node
/* Validate the source-grounded Part 1 answer layer for the two July 8 demo verticals. */

const fs = require("fs");
const path = require("path");
const { composeAnswer } = require("../src/api/answer-composers");
const { REQUIRED_HEADINGS } = require("../src/legal_answer/applied_analysis/legal_research_answer_renderer");
const {
  CASE_DIGEST_CARDS_PATH,
  PARAGRAPH_CARDS_PATH,
  PRINCIPLE_CARDS_PATH,
  SOURCE_CARDS_PATH,
  loadResearchCards,
  sha256,
} = require("../src/legal_answer/applied_analysis/research_card_store");

const ROOT = path.resolve(__dirname, "..");
const RULE_CARD_DIR = path.join(ROOT, "data", "legal_ingest", "applied_answer", "rule_cards");
const TARGET_DECKS = [
  "probate_intestacy_distribution_v1",
  "criminal_theft_shoplifting_v1",
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

function blob(value) {
  return JSON.stringify(value || {}).toLowerCase();
}

function loadDeck(id) {
  return readJson(path.join(RULE_CARD_DIR, `${id}.json`));
}

function validateSourceCards(cards, errors) {
  const seen = new Set();
  for (const card of cards.source_cards) {
    assert(card.source_card_id, "source card missing source_card_id", errors);
    assert(!seen.has(card.source_card_id), `duplicate source card ${card.source_card_id}`, errors);
    seen.add(card.source_card_id);
    assert(card.source_kind === "legislation" || card.source_kind === "case_judgment", `${card.source_card_id}: invalid source_kind`, errors);
    assert(card.official_url?.startsWith("https://"), `${card.source_card_id}: official_url missing`, errors);
    assert(card.verified_text_excerpt && card.verified_text_excerpt.length >= 40, `${card.source_card_id}: verified_text_excerpt too thin`, errors);
    assert(card.checksum === sha256(card.verified_text_excerpt), `${card.source_card_id}: checksum mismatch`, errors);
    assert(!String(card.answer_layer_status || "").includes("answer_safe"), `${card.source_card_id}: source card cannot be answer_safe`, errors);
    assert(card.review_status === "lawyer_review_required", `${card.source_card_id}: review_status should remain lawyer_review_required`, errors);
    if (card.source_kind === "legislation") {
      assert(card.cap && card.section, `${card.source_card_id}: legislation card missing cap/section`, errors);
      assert(card.hklii_api_url?.includes("getcapsection"), `${card.source_card_id}: missing HKLII section API URL`, errors);
    }
    if (card.source_kind === "case_judgment") {
      assert((card.paragraph_refs || []).length >= 1, `${card.source_card_id}: case card missing paragraph refs`, errors);
      assert(card.hklii_url?.includes("#p"), `${card.source_card_id}: case card missing paragraph URL`, errors);
    }
  }
}

function validateParagraphCards(cards, errors) {
  const seen = new Set();
  for (const paragraph of cards.paragraph_cards || []) {
    assert(paragraph.paragraph_id, "paragraph card missing paragraph_id", errors);
    assert(!seen.has(paragraph.paragraph_id), `duplicate paragraph card ${paragraph.paragraph_id}`, errors);
    seen.add(paragraph.paragraph_id);
    assert(paragraph.case_id && paragraph.case_name && paragraph.citation && paragraph.court, `${paragraph.paragraph_id}: case identity incomplete`, errors);
    assert(paragraph.para_no, `${paragraph.paragraph_id}: missing para_no`, errors);
    assert(paragraph.paragraph_text?.length >= 40, `${paragraph.paragraph_id}: paragraph_text too thin`, errors);
    assert(paragraph.source_url?.includes(`#p${paragraph.para_no}`), `${paragraph.paragraph_id}: source_url missing paragraph anchor`, errors);
    assert(paragraph.checksum === sha256(paragraph.paragraph_text), `${paragraph.paragraph_id}: checksum mismatch`, errors);
    assert(cards.sourceById.has(paragraph.source_card_id), `${paragraph.paragraph_id}: source_card_id missing from source cards`, errors);
    assert(paragraph.verification_status === "source_verified_public", `${paragraph.paragraph_id}: paragraph should be source_verified_public`, errors);
    assert(paragraph.answer_layer_status === "research_only", `${paragraph.paragraph_id}: paragraph must remain research_only`, errors);
  }
}

function validateDeck(deck, cards, errors) {
  assert(deck.legal_research_answer, `${deck.rule_deck_id}: missing legal_research_answer`, errors);
  const deckText = blob(deck);
  assert(!deckText.includes("source_verification_required"), `${deck.rule_deck_id}: still contains source_verification_required`, errors);
  for (const rule of deck.source_backed_rules || []) {
    assert(rule.source_card_ids?.length >= 1, `${deck.rule_deck_id}/${rule.id}: source_card_ids missing`, errors);
    assert(rule.verification_status !== "source_verification_required", `${deck.rule_deck_id}/${rule.id}: source not verified`, errors);
    assert(!String(rule.verification_status || "").includes("answer_safe"), `${deck.rule_deck_id}/${rule.id}: cannot auto-mark answer_safe`, errors);
    for (const sourceCardId of rule.source_card_ids || []) {
      assert(cards.sourceById.has(sourceCardId), `${deck.rule_deck_id}/${rule.id}: missing source card ${sourceCardId}`, errors);
    }
  }
  for (const sourceCardId of deck.legal_research_answer.source_card_ids || []) {
    assert(cards.sourceById.has(sourceCardId), `${deck.rule_deck_id}: legal research source card missing ${sourceCardId}`, errors);
  }
  for (const principleId of deck.legal_research_answer.principle_card_ids || []) {
    assert(cards.principleById.has(principleId), `${deck.rule_deck_id}: principle card missing ${principleId}`, errors);
  }
  for (const digestId of deck.legal_research_answer.case_digest_card_ids || []) {
    assert(cards.caseDigestById.has(digestId), `${deck.rule_deck_id}: case digest missing ${digestId}`, errors);
  }
}

function validatePrinciples(cards, errors) {
  for (const principle of cards.principle_cards) {
    assert(principle.principle_id, "principle card missing principle_id", errors);
    assert(principle.principle_text?.length >= 20, `${principle.principle_id}: principle text too thin`, errors);
    assert(principle.exact_quote?.length >= 10, `${principle.principle_id}: exact_quote missing`, errors);
    assert((principle.source_card_ids || []).every(id => cards.sourceById.has(id)), `${principle.principle_id}: missing source_card_id`, errors);
    if (principle.source_type === "case") {
      assert((principle.paragraph_card_ids || []).length >= 1, `${principle.principle_id}: case principle missing paragraph_card_ids`, errors);
      assert((principle.paragraph_card_ids || []).every(id => cards.paragraphById.has(id)), `${principle.principle_id}: missing paragraph_card_id`, errors);
    }
    assert(principle.answer_layer_status === "research_only", `${principle.principle_id}: must remain research_only`, errors);
    assert(!blob(principle).includes("case_recall_only"), `${principle.principle_id}: case_recall_only leaked into principle`, errors);
  }
}

function validateCaseDigests(cards, errors) {
  for (const digest of cards.case_digest_cards) {
    assert(digest.case_digest_card_id, "case digest missing id", errors);
    assert(digest.case_name && digest.citation && digest.court, `${digest.case_digest_card_id}: case identity incomplete`, errors);
    assert((digest.hklii_paragraph_urls || []).every(url => url.includes("#p")), `${digest.case_digest_card_id}: paragraph URL missing #p anchor`, errors);
    assert((digest.paragraph_card_ids || []).length >= 1, `${digest.case_digest_card_id}: paragraph_card_ids missing`, errors);
    assert((digest.paragraph_card_ids || []).every(id => cards.paragraphById.has(id)), `${digest.case_digest_card_id}: missing paragraph card`, errors);
    assert((digest.exact_quotes || []).length >= 1, `${digest.case_digest_card_id}: exact_quotes missing`, errors);
    assert(digest.answer_layer_status === "research_only", `${digest.case_digest_card_id}: must remain research_only`, errors);
  }
}

function validateAnswers(errors) {
  const probate = composeAnswer({
    domain: "probate",
    query: "If my father dies in US and does not have will, now left a son, a daughter and 2 grandaughter; the former 18 the later not; what happens?",
  });
  const theft = composeAnswer({
    domain: "criminal_law",
    query: "If I am alleged to be Stealing something in the convenient store, but i try to argue i just forgot to pay",
  });

  for (const [label, payload] of [["probate", probate], ["theft", theft]]) {
    const headings = (payload.applied_answer?.sections || []).map(section => section.heading);
    assert(payload.applied_answer?.answer_generation_mode === "legal_research_answer_layer", `${label}: not using legal research answer layer`, errors);
    for (const heading of REQUIRED_HEADINGS) {
      assert(headings.includes(heading), `${label}: missing memo heading ${heading}`, errors);
    }
    assert((payload.source_audit?.claims || []).length >= 1, `${label}: missing source_audit.claims`, errors);
    assert(payload.source_audit?.debug_audit?.display === "collapsed", `${label}: debug audit should be collapsed`, errors);
    assert(!blob(payload).includes("case_recall_only"), `${label}: case_recall_only leaked into answer authority`, errors);
  }

  const probateText = blob(probate);
  for (const term of ["intestates' estates ordinance", "cap. 73", "cap. 410", "statutory trusts", "granddaughters", "predeceased", "letters of administration", "source audit"]) {
    assert(probateText.includes(term), `probate answer missing ${term}`, errors);
  }
  assert((probate.applied_answer?.case_digest_card_ids || []).length === 0, "probate should not fake case digest cards", errors);
  assert(probate.unsupported_claims?.some(claim => String(claim).includes("No HKLII paragraph-level probate case authority")), "probate should preserve no-case-authority boundary", errors);

  const theftText = blob(theft);
  for (const term of ["ar / mr matrix", "theft ordinance", "cap. 210", "dishonesty", "intention permanently to deprive", "forgot", "cctv", "prosecution must prove", "hksar v chan kam ching"]) {
    assert(theftText.includes(term), `theft answer missing ${term}`, errors);
  }
  assert((theft.applied_answer?.case_digest_card_ids || []).length >= 2, "theft should attach verified case digest cards", errors);
  assert(theft.unsupported_claims?.some(claim => String(claim).includes("Ivey")), "theft should preserve Ivey/Ghosh unsupported boundary", errors);
  for (const term of ["restaurant wet-floor", "interim payment", "common form grant", "letters of administration route"]) {
    assert(!theftText.includes(term), `theft leaked unrelated term ${term}`, errors);
  }
}

function main() {
  const errors = [];
  assert(fs.existsSync(SOURCE_CARDS_PATH), "source card artifact missing", errors);
  assert(fs.existsSync(PARAGRAPH_CARDS_PATH), "paragraph card artifact missing", errors);
  assert(fs.existsSync(PRINCIPLE_CARDS_PATH), "principle card artifact missing", errors);
  assert(fs.existsSync(CASE_DIGEST_CARDS_PATH), "case digest artifact missing", errors);

  const cards = loadResearchCards();
  const sourcePayload = readJson(SOURCE_CARDS_PATH);
  assert(sourcePayload.source_policy?.public_sources_only === true, "source policy must be public-sources-only", errors);
  for (const sourceClass of ["public_statute", "public_judgment", "public_practice_direction"]) {
    assert((sourcePayload.source_policy?.allowed_public_answer_source_classes || []).includes(sourceClass), `source policy missing ${sourceClass}`, errors);
  }
  validateSourceCards(cards, errors);
  validateParagraphCards(cards, errors);
  validatePrinciples(cards, errors);
  validateCaseDigests(cards, errors);
  for (const deckId of TARGET_DECKS) validateDeck(loadDeck(deckId), cards, errors);
  validateAnswers(errors);

  if (errors.length) {
    console.error("Part 1 two-vertical source-card validation failed:");
    errors.forEach(error => console.error(`- ${error}`));
    process.exit(1);
  }
  console.log("Part 1 two-vertical source-card validation passed.");
}

main();
