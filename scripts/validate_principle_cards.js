#!/usr/bin/env node
/* Validate L3 principle cards synthesized from proposition/paragraph proof. */

const {
  PATHS,
  readJsonl,
  byId,
} = require("../src/legal_answer/case_corpus/case_corpus_store");
const {
  assessPrincipleQuality,
  hasSpecificLiabilityIssue,
  quoteTooShort,
  SENTENCING_PATTERN,
  BACKGROUND_PATTERN,
  LEGAL_TEST_PATTERN,
} = require("../src/legal_answer/case_corpus/principle_quality");

const VALID_AUTHORITY_STRENGTH = new Set(["cfa", "ca", "cfi", "dc", "magistracy", "tribunal", "statute", "practice_direction"]);
const VALID_TREATMENT = new Set(["unchecked", "checked_current", "doubted", "distinguished", "overruled", "superseded_by_statute"]);
const VALID_PRINCIPLE_STATUS = new Set(["pass", "demoted", "needs_review"]);
const VALID_LIABILITY_RELEVANCE = new Set(["liability", "sentencing", "procedure", "background"]);

const paragraphs = readJsonl(PATHS.paragraphsSample);
const propositions = readJsonl(PATHS.propositionsSample);
const principles = readJsonl(PATHS.principlesSample);
const paragraphById = byId(paragraphs, "paragraph_id");
const propositionById = byId(propositions, "proposition_id");
const errors = [];
const minCasesIndex = process.argv.indexOf("--min-cases");
const minCases = Number(minCasesIndex >= 0 ? process.argv[minCasesIndex + 1] : "25");

function assert(condition, message) {
  if (!condition) errors.push(message);
}

const ids = new Set();
assert(new Set(principles.map(item => item.case_id).filter(Boolean)).size >= minCases, `principles cover fewer than ${minCases} case(s)`);
for (const principle of principles) {
  assert(principle.principle_id && !ids.has(principle.principle_id), `${principle.principle_id}: missing/duplicate principle_id`);
  ids.add(principle.principle_id);
  assert(principle.principle_text && principle.principle_text.length > 25, `${principle.principle_id}: principle_text too short`);
  assert(["case", "statute", "practice_direction"].includes(principle.source_type), `${principle.principle_id}: invalid source_type`);
  assert((principle.issue_tags || []).length >= 1, `${principle.principle_id}: issue_tags required`);
  assert(principle.exact_quote_support, `${principle.principle_id}: missing exact_quote_support`);
  assert(!quoteTooShort(principle.exact_quote_support), `${principle.principle_id}: exact_quote_support too short`);
  assert(VALID_AUTHORITY_STRENGTH.has(principle.authority_strength), `${principle.principle_id}: invalid authority_strength`);
  assert(VALID_TREATMENT.has(principle.current_treatment_status || "unchecked"), `${principle.principle_id}: invalid current_treatment_status`);
  assert(VALID_PRINCIPLE_STATUS.has(principle.principle_quality_status), `${principle.principle_id}: invalid/missing principle_quality_status`);
  assert(VALID_LIABILITY_RELEVANCE.has(principle.liability_relevance), `${principle.principle_id}: invalid/missing liability_relevance`);
  assert(typeof principle.usable_in_answer_layer === "boolean", `${principle.principle_id}: usable_in_answer_layer must be boolean`);
  if (principle.principle_quality_status === "demoted") {
    assert(principle.usable_in_answer_layer === false, `${principle.principle_id}: demoted principle cannot be answer-layer usable`);
    assert(principle.demotion_reason, `${principle.principle_id}: demoted principle missing demotion_reason`);
  }
  if (principle.usable_in_answer_layer) {
    assert(principle.principle_quality_status === "pass", `${principle.principle_id}: usable principle must pass quality repair`);
    assert(!principle.demotion_reason, `${principle.principle_id}: usable principle cannot carry demotion_reason`);
  }
  assert(principle.answer_layer_status === "research_only", `${principle.principle_id}: must be research_only`);
  assert(principle.answer_layer_status !== "answer_safe", `${principle.principle_id}: cannot be answer_safe`);
  assert(!/case_recall_only|placeholder|todo/i.test(JSON.stringify(principle)), `${principle.principle_id}: recall-only/placeholder marker present`);
  if (principle.source_type === "case") {
    assert((principle.source_proposition_ids || []).length >= 1, `${principle.principle_id}: missing source_proposition_ids`);
    assert((principle.source_paragraph_ids || []).length >= 1, `${principle.principle_id}: missing source_paragraph_ids`);
    for (const propId of principle.source_proposition_ids || []) {
      assert(propositionById.has(propId), `${principle.principle_id}: missing proposition ${propId}`);
    }
    const linkedParagraphs = (principle.source_paragraph_ids || []).map(id => paragraphById.get(id)).filter(Boolean);
    const linkedPropositions = (principle.source_proposition_ids || []).map(id => propositionById.get(id)).filter(Boolean);
    assert(linkedParagraphs.length === (principle.source_paragraph_ids || []).length, `${principle.principle_id}: missing linked paragraph`);
    assert(linkedParagraphs.some(paragraph => paragraph.paragraph_text.includes(principle.exact_quote_support)), `${principle.principle_id}: exact quote not found in source paragraph`);
    assert(principle.limits, `${principle.principle_id}: case principle requires limits`);
    assert(principle.distinguishable_when, `${principle.principle_id}: case principle requires distinguishable_when`);
    const assessment = assessPrincipleQuality(principle, { paragraphById, propositionById });
    assert(assessment.principle_quality_status === principle.principle_quality_status, `${principle.principle_id}: principle_quality_status does not match validator assessment`);
    assert(assessment.liability_relevance === principle.liability_relevance, `${principle.principle_id}: liability_relevance does not match validator assessment`);
    const roleBlob = linkedParagraphs.concat(linkedPropositions).map(item => `${item.authority_role_candidate || ""} ${item.legal_function || ""} ${item.proposition_text || ""} ${item.paragraph_text || ""}`).join(" ");
    if (BACKGROUND_PATTERN.test(roleBlob) && hasSpecificLiabilityIssue(principle.issue_tags || [])) {
      assert(principle.usable_in_answer_layer === false, `${principle.principle_id}: background-only paragraph cannot become liability principle`);
    }
    if (SENTENCING_PATTERN.test(roleBlob) && hasSpecificLiabilityIssue(principle.issue_tags || [])) {
      assert(principle.usable_in_answer_layer === false, `${principle.principle_id}: sentencing-only paragraph cannot become AR/MR liability principle`);
    }
    if (/(procedural_history|background)/i.test(roleBlob) && LEGAL_TEST_PATTERN.test(principle.principle_text || "")) {
      assert(principle.usable_in_answer_layer === false, `${principle.principle_id}: procedural/background role cannot state usable legal test`);
    }
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
