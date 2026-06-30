#!/usr/bin/env node
/* Validate applied-answer architecture avoids uncontrolled final-prose branching. */

const fs = require("fs");
const path = require("path");
const { composeAnswer } = require("../src/api/answer-composers");
const { buildAppliedAnalysis } = require("../src/legal_answer/applied_analysis/applied_legal_analyzer");
const { loadRuleDecks } = require("../src/legal_answer/applied_analysis/rule_card_loader");

const ROOT = path.resolve(__dirname, "..");
const POLICY_PATH = path.join(ROOT, "data", "legal_ingest", "applied_answer", "future_field_answer_architecture_policy.json");
const PROMPT_PATH = path.join(ROOT, "data", "legal_ingest", "applied_answer", "notebooklm_future_field_prompt_template.md");

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function blob(value) {
  return JSON.stringify(value || {}).toLowerCase();
}

function validateDeck(deck, errors) {
  assert(deck.rule_deck_id, "rule deck missing rule_deck_id", errors);
  assert(deck.domain, `${deck.rule_deck_id}: missing domain`, errors);
  assert(deck.scenario, `${deck.rule_deck_id}: missing scenario`, errors);
  assert(deck.subscenario, `${deck.rule_deck_id}: missing subscenario`, errors);
  assert(deck.answer_blueprint?.title, `${deck.rule_deck_id}: missing answer title`, errors);
  assert(Array.isArray(deck.answer_blueprint?.sections) && deck.answer_blueprint.sections.length >= 4, `${deck.rule_deck_id}: answer blueprint needs sections`, errors);
  assert(Array.isArray(deck.source_backed_rules) && deck.source_backed_rules.length >= 1, `${deck.rule_deck_id}: source_backed_rules missing`, errors);
  assert(deck.answer_contract?.verification_rule, `${deck.rule_deck_id}: answer contract verification rule missing`, errors);
  assert(deck.verifier?.must_include_terms?.length >= 3, `${deck.rule_deck_id}: verifier must_include_terms too thin`, errors);
  assert(Array.isArray(deck.verifier?.must_not_include_terms), `${deck.rule_deck_id}: verifier must_not_include_terms missing`, errors);
  for (const rule of deck.source_backed_rules || []) {
    assert(rule.id, `${deck.rule_deck_id}: source rule missing id`, errors);
    assert(rule.source, `${deck.rule_deck_id}/${rule.id}: source missing`, errors);
    assert(rule.official_url, `${deck.rule_deck_id}/${rule.id}: official_url missing`, errors);
    assert(rule.verification_status, `${deck.rule_deck_id}/${rule.id}: verification_status missing`, errors);
    assert(!String(rule.verification_status).includes("answer_safe"), `${deck.rule_deck_id}/${rule.id}: cannot auto-mark answer_safe`, errors);
  }
}

function validateAppliedOutputs(errors) {
  const probate = composeAnswer({
    domain: "probate",
    query: "If my father dies in US and does not have will, now left a son, a daughter and 2 grandaughter; the former 18 the later not; what happens?",
  });
  assert(probate.applied_answer?.answer_generation_mode === "legal_research_answer_layer", "probate intestacy should use legal research answer layer", errors);
  assert(probate.source_audit?.applied_analysis?.verifier?.status === "passed", "probate verifier should pass", errors);
  assert(blob(probate).includes("granddaughters"), "probate structured answer missing granddaughters", errors);

  const theft = composeAnswer({
    domain: "criminal_law",
    query: "If I am alleged to be Stealing something in the convenient store, but i try to argue i just forgot to pay",
  });
  assert(theft.applied_answer?.answer_generation_mode === "legal_research_answer_layer", "criminal theft should use legal research answer layer", errors);
  assert(theft.source_audit?.applied_analysis?.verifier?.status === "passed", "criminal theft verifier should pass", errors);
  assert(blob(theft).includes("ar / mr matrix"), "criminal theft structured answer missing AR/MR", errors);

  const direct = buildAppliedAnalysis({
    domain: "criminal_law",
    scenario: "theft_property_dishonesty",
    subscenario: "shoplifting_forgot_to_pay_mr_defence",
    query: "I forgot to pay for an item at a shop and security stopped me.",
  });
  assert(direct.matched === true, "direct criminal rule-deck lookup should match", errors);
  assert(direct.verification?.status === "passed", "direct criminal rule-deck verifier should pass", errors);
}

function main() {
  const errors = [];
  const decks = loadRuleDecks();
  const policy = JSON.parse(read(POLICY_PATH));
  const prompt = read(PROMPT_PATH).toLowerCase();
  const probateComposer = read(path.join(ROOT, "src", "api", "answer-composers", "probate.js"));
  const criminalComposer = read(path.join(ROOT, "src", "api", "answer-composers", "criminal_law.js"));

  assert(decks.length >= 2, "expected at least two applied-answer rule decks", errors);
  decks.forEach(deck => validateDeck(deck, errors));

  assert(policy.notebooklm_browser_workflow?.notebooklm_not_authority === true, "policy must mark NotebookLM non-authority", errors);
  assert(policy.architecture?.required_layers?.includes("structured_fact_extraction"), "policy missing structured fact extraction layer", errors);
  assert(policy.architecture?.required_layers?.includes("answer_verifier"), "policy missing verifier layer", errors);
  assert(policy.new_field_acceptance_gate?.must_not?.some(item => item.includes("final-prose composer branch")), "policy must forbid final-prose branches without rule decks", errors);
  assert(prompt.includes("do not write final legal advice"), "NotebookLM prompt must forbid final legal advice", errors);
  assert(prompt.includes("public source lookup"), "NotebookLM prompt must require public source lookup", errors);

  assert(probateComposer.includes("buildAppliedAnalysis"), "probate composer must use shared applied analyzer", errors);
  assert(criminalComposer.includes("buildAppliedAnalysis"), "criminal composer must use shared applied analyzer", errors);

  validateAppliedOutputs(errors);

  if (errors.length) {
    console.error("Applied answer architecture validation failed:");
    errors.forEach(error => console.error(`- ${error}`));
    process.exit(1);
  }
  console.log(`Applied answer architecture validation passed (${decks.length} rule decks).`);
}

main();
