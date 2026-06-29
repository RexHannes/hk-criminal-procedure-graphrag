#!/usr/bin/env node
/* Validate corpus status dashboard against actual L1-L3.5 sample artifacts. */

const fs = require("fs");
const path = require("path");
const {
  ROOT,
  PATHS,
  readJsonl,
  sha256NormalizedParagraphText,
} = require("../src/legal_answer/case_corpus/case_corpus_store");

const STATUS_JSON_PATH = path.join(ROOT, "artifacts", "case_corpus_l1_l35_status.json");
const STATUS_MD_PATH = path.join(ROOT, "artifacts", "case_corpus_l1_l35_status.md");

const report = JSON.parse(fs.readFileSync(STATUS_JSON_PATH, "utf8"));
const markdown = fs.readFileSync(STATUS_MD_PATH, "utf8");
const registry = readJsonl(PATHS.registrySample);
const paragraphs = readJsonl(PATHS.paragraphsSample);
const propositions = readJsonl(PATHS.propositionsSample);
const principles = readJsonl(PATHS.principlesSample);
const digests = readJsonl(PATHS.digestsSample);
const issueMap = readJsonl(PATHS.issueMapSample);
const errors = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

const quotePassCount = propositions.filter(prop => {
  const text = paragraphs
    .filter(paragraph => (prop.source_paragraph_ids || []).includes(paragraph.paragraph_id))
    .map(paragraph => paragraph.paragraph_text)
    .join(" ");
  return text.includes(prop.exact_quote_support || "");
}).length;
const checksumPassCount = paragraphs.filter(paragraph => paragraph.checksum === sha256NormalizedParagraphText(paragraph.paragraph_text)).length;
const researchOnlyCount = []
  .concat(registry, paragraphs, propositions, principles, digests)
  .filter(item => item.answer_layer_status === "research_only").length;

assert(report.registry_case_count === registry.length, "registry_case_count mismatch");
assert(report.paragraphized_case_count === new Set(paragraphs.map(item => item.case_id)).size, "paragraphized_case_count mismatch");
assert(report.paragraph_card_count === paragraphs.length, "paragraph_card_count mismatch");
assert(report.proposition_card_count === propositions.length, "proposition_card_count mismatch");
assert(report.principle_card_count === principles.length, "principle_card_count mismatch");
assert(report.case_digest_card_count === digests.length, "case_digest_card_count mismatch");
assert(report.issue_mapped_case_count === new Set(issueMap.map(item => item.case_id)).size, "issue_mapped_case_count mismatch");
assert(report.paragraph_anchor_pass_rate === 1, "paragraph anchor pass rate must be 1 for sample");
assert(report.quote_support_pass_rate === quotePassCount / propositions.length, "quote support pass rate mismatch");
assert(report.checksum_pass_rate === checksumPassCount / paragraphs.length, "checksum pass rate mismatch");
assert(report.answer_safe_count === 0, "answer_safe_count must remain 0");
assert(report.research_only_count === researchOnlyCount, "research_only_count mismatch");
assert(report.layers?.L4?.includes("not implemented"), "L4 boundary missing");
assert(markdown.includes("L4 answer-safe review: not implemented"), "status markdown missing L4 boundary");
assert(markdown.includes("Do not describe this sample as 10k answer-safe propositions"), "status markdown missing forbidden claim");

if (errors.length) {
  console.error("Case corpus L1-L3.5 status validation failed:");
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log("Case corpus L1-L3.5 status validation passed.");
