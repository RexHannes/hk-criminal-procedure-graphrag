#!/usr/bin/env node
/* Validate L2 paragraph cards: anchors, checksums, source linkage and review state. */

const {
  PATHS,
  readJsonl,
  sha256NormalizedParagraphText,
  publicSourceUrl,
} = require("../src/legal_answer/case_corpus/case_corpus_store");

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const full = process.argv.includes("--full");
const sampleSize = Number(argValue("--sample-size", full ? "0" : "50"));
const registry = readJsonl(PATHS.registrySample);
const registryIds = new Set(registry.map(item => item.case_id));
const allParagraphs = readJsonl(PATHS.paragraphsSample);
const paragraphs = !full && sampleSize > 0 ? allParagraphs.slice(0, sampleSize) : allParagraphs;
const errors = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

const ids = new Set();
for (const [index, paragraph] of paragraphs.entries()) {
  const label = paragraph.paragraph_id || `paragraph_${index + 1}`;
  assert(paragraph.paragraph_id && !ids.has(paragraph.paragraph_id), `${label}: missing/duplicate paragraph_id`);
  ids.add(paragraph.paragraph_id);
  assert(registryIds.has(paragraph.case_id), `${label}: case_id not found in registry`);
  assert(paragraph.paragraph_text && paragraph.paragraph_text.trim().length > 10, `${label}: paragraph_text too short`);
  assert(publicSourceUrl(paragraph.source_url), `${label}: source_url is not approved public URL`);
  if (paragraph.para_no) assert(new RegExp(`#p${paragraph.para_no}$`, "i").test(paragraph.source_url || ""), `${label}: source_url lacks exact #p${paragraph.para_no} anchor`);
  assert(paragraph.checksum_algorithm === "sha256_normalized_paragraph_text", `${label}: wrong checksum_algorithm`);
  assert(paragraph.checksum === sha256NormalizedParagraphText(paragraph.paragraph_text), `${label}: checksum mismatch`);
  assert(paragraph.answer_layer_status === "research_only", `${label}: paragraph must be research_only`);
  assert(paragraph.answer_layer_status !== "answer_safe", `${label}: paragraph cannot be answer_safe`);
  assert(paragraph.verification_status === "source_verified_public", `${label}: paragraph must be source_verified_public`);
  assert(paragraph.review_status === "machine_candidate", `${label}: paragraph must remain machine_candidate`);
  assert(!/case_recall_only|placeholder|todo/i.test(JSON.stringify(paragraph)), `${label}: recall-only/placeholder marker present`);
}

if (errors.length) {
  console.error("HKLII paragraph accuracy validation failed:");
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log(JSON.stringify({
  validator: "validate_hklii_paragraph_accuracy",
  checked: paragraphs.length,
  total_available: allParagraphs.length,
  mode: full ? "full" : "sample",
  status: "passed",
}, null, 2));
