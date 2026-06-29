#!/usr/bin/env node
/* Validate L3 principle cards synthesized from proposition/paragraph proof. */

const {
  PATHS,
  readJsonl,
  byId,
} = require("../src/legal_answer/case_corpus/case_corpus_store");

const VALID_AUTHORITY_STRENGTH = new Set(["cfa", "ca", "cfi", "dc", "magistracy", "tribunal", "statute", "practice_direction"]);
const VALID_TREATMENT = new Set(["unchecked", "checked_current", "doubted", "distinguished", "overruled", "superseded_by_statute"]);

const paragraphs = readJsonl(PATHS.paragraphsSample);
const propositions = readJsonl(PATHS.propositionsSample);
const principles = readJsonl(PATHS.principlesSample);
const paragraphById = byId(paragraphs, "paragraph_id");
const propositionById = byId(propositions, "proposition_id");
const errors = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

const ids = new Set();
for (const principle of principles) {
  assert(principle.principle_id && !ids.has(principle.principle_id), `${principle.principle_id}: missing/duplicate principle_id`);
  ids.add(principle.principle_id);
  assert(principle.principle_text && principle.principle_text.length > 25, `${principle.principle_id}: principle_text too short`);
  assert(["case", "statute", "practice_direction"].includes(principle.source_type), `${principle.principle_id}: invalid source_type`);
  assert((principle.issue_tags || []).length >= 1, `${principle.principle_id}: issue_tags required`);
  assert(principle.exact_quote_support, `${principle.principle_id}: missing exact_quote_support`);
  assert(VALID_AUTHORITY_STRENGTH.has(principle.authority_strength), `${principle.principle_id}: invalid authority_strength`);
  assert(VALID_TREATMENT.has(principle.current_treatment_status || "unchecked"), `${principle.principle_id}: invalid current_treatment_status`);
  assert(principle.answer_layer_status === "research_only", `${principle.principle_id}: must be research_only`);
  assert(principle.answer_layer_status !== "answer_safe", `${principle.principle_id}: cannot be answer_safe`);
  if (principle.source_type === "case") {
    assert((principle.source_proposition_ids || []).length >= 1, `${principle.principle_id}: missing source_proposition_ids`);
    assert((principle.source_paragraph_ids || []).length >= 1, `${principle.principle_id}: missing source_paragraph_ids`);
    for (const propId of principle.source_proposition_ids || []) {
      assert(propositionById.has(propId), `${principle.principle_id}: missing proposition ${propId}`);
    }
    const linkedParagraphs = (principle.source_paragraph_ids || []).map(id => paragraphById.get(id)).filter(Boolean);
    assert(linkedParagraphs.length === (principle.source_paragraph_ids || []).length, `${principle.principle_id}: missing linked paragraph`);
    assert(linkedParagraphs.some(paragraph => paragraph.paragraph_text.includes(principle.exact_quote_support)), `${principle.principle_id}: exact quote not found in source paragraph`);
    assert(principle.limits, `${principle.principle_id}: case principle requires limits`);
    assert(principle.distinguishable_when, `${principle.principle_id}: case principle requires distinguishable_when`);
    assert((principle.current_treatment_status || "unchecked") === "unchecked" || principle.review_status === "lawyer_review_required", `${principle.principle_id}: treatment changed without review gate`);
  }
}

if (errors.length) {
  console.error("Principle card validation failed:");
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log(JSON.stringify({
  validator: "validate_principle_cards",
  mode: process.argv.includes("--sample") ? "sample" : "default",
  principle_card_count: principles.length,
  status: "passed",
}, null, 2));
