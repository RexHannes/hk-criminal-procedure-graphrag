#!/usr/bin/env node
/* Validate L3 paragraph-backed proposition cards. */

const {
  PATHS,
  readJsonl,
  byId,
} = require("../src/legal_answer/case_corpus/case_corpus_store");

const VALID_LEGAL_FUNCTIONS = new Set([
  "element",
  "test",
  "defence",
  "burden",
  "evidential_factor",
  "procedure",
  "sentencing",
  "statutory_interpretation",
  "case_application",
  "background_only",
]);

const VALID_AUTHORITY_ROLES = new Set([
  "ratio_candidate",
  "obiter_candidate",
  "application_to_facts",
  "procedural_history",
  "sentencing_observation",
  "background",
]);

const registry = readJsonl(PATHS.registrySample);
const paragraphs = readJsonl(PATHS.paragraphsSample);
const propositions = readJsonl(PATHS.propositionsSample);
const caseIds = new Set(registry.map(item => item.case_id));
const paragraphById = byId(paragraphs, "paragraph_id");
const errors = [];
const minCasesIndex = process.argv.indexOf("--min-cases");
const minCases = Number(minCasesIndex >= 0 ? process.argv[minCasesIndex + 1] : "25");

function assert(condition, message) {
  if (!condition) errors.push(message);
}

const ids = new Set();
assert(new Set(propositions.map(item => item.case_id)).size >= minCases, `propositions cover fewer than ${minCases} case(s)`);
for (const prop of propositions) {
  assert(prop.proposition_id && !ids.has(prop.proposition_id), `${prop.proposition_id}: missing/duplicate proposition_id`);
  ids.add(prop.proposition_id);
  assert(caseIds.has(prop.case_id), `${prop.proposition_id}: unsupported case citation/case_id`);
  assert(prop.proposition_text && prop.proposition_text.length > 20, `${prop.proposition_id}: proposition_text too short`);
  assert((prop.source_paragraph_ids || []).length >= 1, `${prop.proposition_id}: missing source_paragraph_ids`);
  assert(prop.exact_quote_support, `${prop.proposition_id}: missing exact_quote_support`);
  const linkedParagraphs = (prop.source_paragraph_ids || []).map(id => paragraphById.get(id)).filter(Boolean);
  assert(linkedParagraphs.length === (prop.source_paragraph_ids || []).length, `${prop.proposition_id}: missing linked paragraph card`);
  assert(linkedParagraphs.some(paragraph => paragraph.paragraph_text.includes(prop.exact_quote_support)), `${prop.proposition_id}: exact_quote_support not found in linked paragraph text`);
  assert((prop.issue_tags || []).length >= 1, `${prop.proposition_id}: issue_tags required`);
  assert(VALID_LEGAL_FUNCTIONS.has(prop.legal_function), `${prop.proposition_id}: invalid legal_function`);
  assert(VALID_AUTHORITY_ROLES.has(prop.authority_role_candidate), `${prop.proposition_id}: invalid authority_role_candidate`);
  assert(prop.answer_layer_status === "research_only", `${prop.proposition_id}: must be research_only`);
  assert(prop.review_status === "machine_candidate" || prop.review_status === "needs_review", `${prop.proposition_id}: invalid review_status`);
  assert(prop.answer_layer_status !== "answer_safe", `${prop.proposition_id}: cannot be answer_safe`);
  assert(!/case_recall_only|placeholder|todo/i.test(JSON.stringify(prop)), `${prop.proposition_id}: recall-only/placeholder marker present`);
  if (prop.legal_function === "background_only") {
    assert(!/principle|test|requires|must/i.test(prop.proposition_text), `${prop.proposition_id}: background_only reads like a legal principle`);
  }
}

if (errors.length) {
  console.error("Proposition card validation failed:");
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log(JSON.stringify({
  validator: "validate_proposition_cards",
  mode: process.argv.includes("--sample") ? "sample" : "default",
  proposition_card_count: propositions.length,
  status: "passed",
}, null, 2));
