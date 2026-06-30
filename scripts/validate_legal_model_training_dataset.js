#!/usr/bin/env node
/* Validate legal-model SFT/eval datasets against source-proof and safety gates. */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SFT_DIR = path.join(ROOT, "data", "legal_model_training", "sft");
const CORPUS_DIR = path.join(ROOT, "data", "legal_ingest", "case_corpus");
const errors = [];

const REQUIRED_FILES = [
  "paragraph_to_proposition_train.jsonl",
  "paragraph_to_proposition_eval.jsonl",
  "proposition_to_principle_train.jsonl",
  "proposition_to_principle_eval.jsonl",
  "demotion_classifier_train.jsonl",
  "demotion_classifier_eval.jsonl",
  "retrieved_authorities_to_memo_train.jsonl",
  "retrieved_authorities_to_memo_eval.jsonl",
  "teacher_verified_extraction_train.jsonl",
  "teacher_verified_extraction_eval.jsonl",
];

function fail(message) {
  errors.push(message);
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`missing ${path.relative(ROOT, filePath)}`);
    return [];
  }
  const text = fs.readFileSync(filePath, "utf8").trim();
  if (!text) return [];
  return text.split(/\n+/).filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      fail(`${path.relative(ROOT, filePath)}:${index + 1} invalid JSON: ${error.message}`);
      return null;
    }
  }).filter(Boolean);
}

function publicSourceUrl(url = "") {
  return /^https:\/\/(www\.)?(hklii|legalref|judiciary)\./i.test(url);
}

function blockedMaterial(value) {
  return /\b(private_source_content|licensed_source_content|client_document_text|case_recall_only|source_candidate|candidate_only|not_admissible_until_verified|lexis|westlaw|private_or_licensed)\b/i.test(JSON.stringify(value));
}

function by(items, key) {
  return new Map(items.map(item => [item[key], item]));
}

const paragraphs = readJsonl(path.join(CORPUS_DIR, "paragraph_cards_sample_100.jsonl"));
const paragraphById = by(paragraphs, "paragraph_id");
const paragraphByUrl = by(paragraphs, "source_url");
const allExamples = [];
const seenBySplit = { train: new Set(), eval: new Set() };

for (const file of REQUIRED_FILES) {
  const rows = readJsonl(path.join(SFT_DIR, file));
  for (const row of rows) {
    row.__file = file;
    allExamples.push(row);
  }
}

for (const row of allExamples) {
  const label = `${row.__file}:${row.example_id || "(missing example_id)"}`;
  if (!row.example_id) fail(`${label} missing example_id`);
  if (row.answer_safe === true) fail(`${label} has answer_safe=true`);
  if (blockedMaterial(row)) fail(`${label} contains private/source-candidate/recall-only material`);
  if (row.provenance?.teacher_candidate === true && row.provenance?.verification_status !== "teacher_verified_quote_backed") {
    fail(`${label} includes teacher candidate without teacher_verified_quote_backed verification`);
  }
  if (row.split !== "train" && row.split !== "eval") fail(`${label} missing train/eval split`);
  if (row.split && seenBySplit[row.split]) seenBySplit[row.split].add(row.example_id);

  const unsupportedMemo = row.task === "retrieved_authorities_to_memo" && row.input?.expected_abstention === true;
  if (unsupportedMemo) {
    if (row.output?.supported_legal_answer !== false) fail(`${label} unsupported example treated as supported legal answer`);
    if (/Source URL: https:\/\/www\.hklii\.hk\/en\/cases\//.test(row.output?.memo_markdown || "")) {
      fail(`${label} unsupported example cites case-law authority`);
    }
    continue;
  }

  if (!(row.source_urls || []).length) fail(`${label} lacks source URL`);
  for (const url of row.source_urls || []) {
    if (!publicSourceUrl(url)) fail(`${label} has non-public source URL ${url}`);
  }

  if (["paragraph_to_proposition", "proposition_to_principle", "demotion_classifier", "teacher_verified_extraction"].includes(row.task)) {
    if (!(row.paragraph_ids || []).length) fail(`${label} lacks paragraph proof`);
    if (!String(row.exact_quote_support || "").trim()) fail(`${label} lacks exact quote support`);
    for (const paragraphId of row.paragraph_ids || []) {
      const paragraph = paragraphById.get(paragraphId);
      if (!paragraph) {
        fail(`${label} references missing paragraph ${paragraphId}`);
        continue;
      }
      if (!paragraph.paragraph_text.includes(row.exact_quote_support)) {
        fail(`${label} quote support does not appear in ${paragraphId}`);
      }
    }
  }

  if (row.task === "paragraph_to_proposition" && !String(row.output?.proposition_text || "").trim()) {
    fail(`${label} positive proposition lacks proposition_text`);
  }
  if (row.task === "proposition_to_principle") {
    if (row.usable_in_answer_layer !== true) fail(`${label} principle positive is not usable`);
    if ((row.demotion_reasons || []).length) fail(`${label} principle positive has demotion reasons`);
    if (!String(row.output?.principle_text || "").trim()) fail(`${label} principle positive lacks principle_text`);
  }
  if (row.task === "retrieved_authorities_to_memo" && row.output?.supported_legal_answer === true) {
    const urls = Array.from((row.output?.memo_markdown || "").matchAll(/https:\/\/www\.hklii\.hk\/en\/cases\/[^\s)]+#p\d+/g)).map(match => match[0]);
    if (!urls.length) fail(`${label} supported memo lacks paragraph URLs`);
    for (const url of urls) {
      if (!paragraphByUrl.has(url)) fail(`${label} cites URL without committed paragraph card: ${url}`);
    }
  }
}

for (const id of seenBySplit.train) {
  if (seenBySplit.eval.has(id)) fail(`train/eval leakage by identical example_id: ${id}`);
}

if (errors.length) {
  console.error("Legal model training dataset validation failed:");
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log(JSON.stringify({
  validator: "validate_legal_model_training_dataset",
  example_count: allExamples.length,
  train_count: seenBySplit.train.size,
  eval_count: seenBySplit.eval.size,
  status: "passed",
}, null, 2));
