#!/usr/bin/env node
/* Validate the candidate-only fast-growth pipeline and generated cards. */

const fs = require("fs");
const {
  PATHS,
  readJsonl,
  byId,
} = require("../src/legal_answer/case_corpus/case_corpus_store");
const {
  VERIFICATION_REPORT_JSON,
  CARD_BUILD_REPORT_JSON,
} = require("../src/legal_answer/case_corpus/candidate_extraction_factory");

const errors = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

const candidates = readJsonl(PATHS.candidateExtractionsSample);
const verification = JSON.parse(fs.readFileSync(VERIFICATION_REPORT_JSON, "utf8"));
const cardReport = JSON.parse(fs.readFileSync(CARD_BUILD_REPORT_JSON, "utf8"));
const paragraphs = readJsonl(PATHS.candidateVerifiedParagraphs);
const propositions = readJsonl(PATHS.candidateVerifiedPropositions);
const principles = readJsonl(PATHS.candidateVerifiedPrinciples);
const digests = readJsonl(PATHS.candidateVerifiedDigests);
const issueMap = readJsonl(PATHS.candidateVerifiedIssueMap);
const paragraphById = byId(paragraphs, "paragraph_id");
const propositionById = byId(propositions, "proposition_id");
const principleById = byId(principles, "principle_id");

for (const candidate of candidates) {
  assert(candidate.extraction_status === "candidate_only", `${candidate.candidate_id}: extraction must be candidate_only`);
  assert(candidate.authority_status === "not_authority", `${candidate.candidate_id}: candidate must not be authority`);
}

assert(verification.summary.candidate_extractions_total === candidates.length, "candidate total mismatch");
assert(verification.summary.candidates_verified >= 25, "fewer than 25 candidates verified");
assert(verification.summary.verified_cases_added >= 25, "fewer than 25 verified cases");
assert(verification.summary.candidates_rejected >= 1, "rejection report should include rejected candidates");
assert(verification.summary.paragraph_cards_added >= 100, "fewer than 100 verified paragraph cards from candidates");
assert(verification.summary.propositions_added >= 50, "fewer than 50 candidate propositions");
assert(verification.summary.principles_added >= 25, "fewer than 25 candidate principles");
assert(verification.summary.digests_added >= 25, "fewer than 25 candidate digests");
assert(verification.summary.cards_demoted >= 1, "expected at least one demotion-flagged candidate card");
for (const reason of ["background_only_not_principle", "sentencing_only_not_liability", "quote_too_short", "quote_context_insufficient", "current_treatment_unchecked", "issue_tag_overbroad"]) {
  assert(Object.prototype.hasOwnProperty.call(verification.summary.demotion_reasons || {}, reason), `missing demotion category ${reason}`);
}
assert(verification.summary.answer_safe_count === 0, "candidate workflow cannot create answer_safe cards");
assert(Object.keys(verification.summary.rejection_reasons || {}).length >= 1, "rejection reasons missing");

for (const accepted of verification.accepted_candidates || []) {
  assert(accepted.authority_status === "not_authority", `${accepted.candidate_id}: accepted candidate still must not be authority`);
  assert((accepted.accepted_quotes || []).length >= 1, `${accepted.candidate_id}: accepted candidate missing quotes`);
  for (const quote of accepted.accepted_quotes || []) {
    assert(quote.paragraph_id && quote.exact_quote_support, `${accepted.candidate_id}: quote lacks paragraph proof`);
  }
}

for (const rejected of verification.rejected_candidates || []) {
  assert((rejected.rejection_reasons || []).length >= 1 || (rejected.rejected_quotes || []).length >= 1, `${rejected.candidate_id}: rejected candidate lacks reason`);
}

for (const paragraph of paragraphs) {
  assert(paragraph.answer_layer_status === "research_only", `${paragraph.paragraph_id}: paragraph must be research_only`);
  assert(paragraph.review_status === "machine_candidate", `${paragraph.paragraph_id}: paragraph must be machine_candidate`);
  assert(paragraph.source_url && /#p\d+$/i.test(paragraph.source_url), `${paragraph.paragraph_id}: paragraph URL lacks #p anchor`);
}

for (const prop of propositions) {
  assert(prop.answer_layer_status === "research_only", `${prop.proposition_id}: proposition must be research_only`);
  assert(prop.review_status === "machine_candidate", `${prop.proposition_id}: proposition must be machine_candidate`);
  assert(prop.authority_status === "not_authority", `${prop.proposition_id}: proposition source must not become authority`);
  assert(Array.isArray(prop.demotion_flags), `${prop.proposition_id}: demotion_flags missing`);
  assert((prop.source_paragraph_ids || []).length >= 1, `${prop.proposition_id}: missing paragraph proof`);
  assert(prop.exact_quote_support, `${prop.proposition_id}: missing quote support`);
  const linked = (prop.source_paragraph_ids || []).map(id => paragraphById.get(id)).filter(Boolean);
  assert(linked.length === (prop.source_paragraph_ids || []).length, `${prop.proposition_id}: missing linked paragraph`);
  assert(linked.some(paragraph => paragraph.paragraph_text.includes(prop.exact_quote_support)), `${prop.proposition_id}: quote not found in paragraph`);
  assert(prop.answer_layer_status !== "answer_safe", `${prop.proposition_id}: cannot be answer_safe`);
}

for (const principle of principles) {
  assert(principle.answer_layer_status === "research_only", `${principle.principle_id}: principle must be research_only`);
  assert(principle.authority_status === "not_authority", `${principle.principle_id}: principle source must not become authority`);
  assert(Array.isArray(principle.demotion_flags), `${principle.principle_id}: demotion_flags missing`);
  assert((principle.source_proposition_ids || []).every(id => propositionById.has(id)), `${principle.principle_id}: missing proposition link`);
  assert((principle.source_paragraph_ids || []).every(id => paragraphById.has(id)), `${principle.principle_id}: missing paragraph link`);
  assert(principle.answer_layer_status !== "answer_safe", `${principle.principle_id}: cannot be answer_safe`);
}

for (const digest of digests) {
  assert(digest.answer_layer_status === "research_only", `${digest.case_digest_card_id}: digest must be research_only`);
  assert(digest.review_status === "lawyer_review_required", `${digest.case_digest_card_id}: digest must require lawyer review`);
  assert((digest.key_paragraphs || []).every(id => paragraphById.has(id)), `${digest.case_digest_card_id}: missing digest paragraph link`);
  assert((digest.proposition_ids || []).every(id => propositionById.has(id)), `${digest.case_digest_card_id}: missing digest proposition link`);
  assert((digest.principle_ids || []).every(id => principleById.has(id)), `${digest.case_digest_card_id}: missing digest principle link`);
  assert(digest.answer_layer_status !== "answer_safe", `${digest.case_digest_card_id}: digest cannot be answer_safe`);
}

for (const mapItem of issueMap) {
  assert(mapItem.source_status === "candidate_paragraph_quote_verified_research_only", `${mapItem.case_id}/${mapItem.issue_id}: issue map source status wrong`);
}

assert(cardReport.answer_safe_count === 0, "card build report answer_safe_count must be 0");
assert(cardReport.cards_demoted === propositions.filter(item => (item.demotion_flags || []).length).length + principles.filter(item => (item.demotion_flags || []).length).length, "cards_demoted report mismatch");
assert(cardReport.paragraph_cards_added === paragraphs.length, "paragraph card report mismatch");
assert(cardReport.propositions_added === propositions.length, "proposition report mismatch");
assert(cardReport.principles_added === principles.length, "principle report mismatch");
assert(cardReport.digests_added === digests.length, "digest report mismatch");

if (errors.length) {
  console.error("Candidate extraction verification validation failed:");
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log(JSON.stringify({
  validator: "validate_candidate_extraction_verification",
  candidate_extractions_total: verification.summary.candidate_extractions_total,
  candidates_verified: verification.summary.candidates_verified,
  candidates_rejected: verification.summary.candidates_rejected,
  paragraph_cards_added: paragraphs.length,
  propositions_added: propositions.length,
  principles_added: principles.length,
  digests_added: digests.length,
  status: "passed",
}, null, 2));
