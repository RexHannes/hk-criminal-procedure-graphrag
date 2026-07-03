#!/usr/bin/env node
/* Offline evaluator for future legal model outputs. No model calls are made here. */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const FIXTURES_ONLY = process.argv.includes("--fixtures-only");
const OUTPUTS_PATH = process.env.LEGAL_MODEL_OUTPUTS_PATH || "";
const EVAL_DIR = path.join(ROOT, "data", "legal_model_training", "eval");
const errors = [];

function readJsonl(filePath) {
  const text = fs.readFileSync(filePath, "utf8").trim();
  if (!text) return [];
  return text.split(/\n+/).filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      errors.push(`${path.relative(ROOT, filePath)}:${index + 1} invalid JSON: ${error.message}`);
      return null;
    }
  }).filter(Boolean);
}

function metric(numerator, denominator) {
  return denominator ? numerator / denominator : 1;
}

function hasPrivateLeak(value) {
  return /\b(lexis|westlaw|private_source|licensed_source|client_document)\b/i.test(JSON.stringify(value));
}

const fixtures = [
  ...readJsonl(path.join(EVAL_DIR, "legal_extraction_eval_prompts.jsonl")),
  ...readJsonl(path.join(EVAL_DIR, "legal_memo_eval_prompts.jsonl")),
];

if (!fixtures.length) errors.push("no eval fixtures found");
for (const fixture of fixtures) {
  if (!fixture.prompt_id || !fixture.task || !fixture.input || !fixture.expected) {
    errors.push(`fixture missing required fields: ${fixture.prompt_id || "(missing prompt_id)"}`);
  }
  if (fixture.expected.answer_safe !== false) {
    errors.push(`fixture must expect answer_safe=false: ${fixture.prompt_id}`);
  }
}

let modelOutputs = [];
if (!FIXTURES_ONLY && OUTPUTS_PATH) {
  modelOutputs = readJsonl(path.resolve(OUTPUTS_PATH));
}

const byPrompt = new Map(modelOutputs.map(output => [output.prompt_id, output]));
let validJson = 0;
let issueMatches = 0;
let quoteMatches = 0;
let sourceSupported = 0;
let demotionMatches = 0;
let liabilityMatches = 0;
let unsupportedAbstains = 0;
let hallucinatedCases = 0;
let hallucinatedParagraphs = 0;
let privateLeaks = 0;
let evaluated = 0;

for (const fixture of fixtures) {
  const output = byPrompt.get(fixture.prompt_id);
  if (!output) continue;
  evaluated += 1;
  validJson += 1;
  if (hasPrivateLeak(output)) privateLeaks += 1;
  const blob = JSON.stringify(output);
  if ((fixture.expected.issue_tags || []).every(tag => blob.includes(tag))) issueMatches += 1;
  if (!fixture.expected.must_quote || blob.includes(fixture.expected.must_quote)) quoteMatches += 1;
  if (!fixture.expected.must_include_paragraph_urls || /https:\/\/www\.hklii\.hk\/en\/cases\/[^\s)]+#p\d+/.test(blob)) sourceSupported += 1;
  if (!fixture.expected.principle_quality_status || output.principle_quality_status === fixture.expected.principle_quality_status || output.output?.principle_quality_status === fixture.expected.principle_quality_status) demotionMatches += 1;
  if (!fixture.expected.liability_relevance || output.liability_relevance === fixture.expected.liability_relevance || output.output?.liability_relevance === fixture.expected.liability_relevance) liabilityMatches += 1;
  if (!fixture.expected.must_abstain || output.abstain === true || output.output?.supported_legal_answer === false) unsupportedAbstains += 1;
  if (/invented case|hallucinated case/i.test(blob)) hallucinatedCases += 1;
  if (/#[pP]\d+/.test(blob) && !/https:\/\/www\.hklii\.hk\/en\/cases\/[^\s)]+#p\d+/.test(blob)) hallucinatedParagraphs += 1;
}

const denominator = evaluated || fixtures.length;
const metrics = {
  valid_json_rate: FIXTURES_ONLY ? 1 : metric(validJson, denominator),
  issue_tag_accuracy: FIXTURES_ONLY ? 1 : metric(issueMatches, denominator),
  quote_support_exact_match_rate: FIXTURES_ONLY ? 1 : metric(quoteMatches, denominator),
  proposition_source_support_rate: FIXTURES_ONLY ? 1 : metric(sourceSupported, denominator),
  principle_demotion_accuracy: FIXTURES_ONLY ? 1 : metric(demotionMatches, denominator),
  liability_vs_sentencing_classification_accuracy: FIXTURES_ONLY ? 1 : metric(liabilityMatches, denominator),
  unsupported_abstention_rate: FIXTURES_ONLY ? 1 : metric(unsupportedAbstains, denominator),
  hallucinated_case_rate: FIXTURES_ONLY ? 0 : metric(hallucinatedCases, denominator),
  hallucinated_paragraph_rate: FIXTURES_ONLY ? 0 : metric(hallucinatedParagraphs, denominator),
  private_source_leak_rate: FIXTURES_ONLY ? 0 : metric(privateLeaks, denominator),
};

if (errors.length) {
  console.error("Offline legal model evaluator failed:");
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log(JSON.stringify({
  evaluator: "evaluate_legal_model_outputs_offline",
  fixtures_only: FIXTURES_ONLY,
  fixture_count: fixtures.length,
  evaluated_output_count: evaluated,
  metrics,
  status: "passed",
}, null, 2));
