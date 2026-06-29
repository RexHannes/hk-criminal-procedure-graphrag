#!/usr/bin/env node
/* Validate saved L1-L3.5 case-corpus demo outputs. */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "artifacts", "demo_outputs");
const errors = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function read(name) {
  const filePath = path.join(OUT_DIR, name);
  if (!fs.existsSync(filePath)) {
    errors.push(`missing ${name}`);
    return "";
  }
  return fs.readFileSync(filePath, "utf8");
}

const theftMd = read("theft_case_corpus_l35_answer.md");
const theftJson = read("theft_case_corpus_l35_answer.json");
const probateMd = read("probate_case_corpus_l35_answer.md");
const unsupportedMd = read("unsupported_general_query_l35_answer.md");

assert(theftMd.includes("L1-L3.5 Case-Law Research Memo"), "theft demo missing L3.5 memo");
assert(theftMd.includes("Case-by-Case Authorities"), "theft demo missing case-by-case authorities");
assert(theftMd.includes("Exact quote:"), "theft demo missing exact quote");
assert(theftMd.includes("HKSAR v Chan Kam Ching"), "theft demo missing Chan Kam Ching");
assert(theftMd.includes("https://www.hklii.hk/en/cases/hkcfa/2022/7#p148"), "theft demo missing HKLII paragraph URL");
assert(theftMd.includes("Evidence Analysis"), "theft demo missing evidence analysis");
assert(theftMd.includes("not legal authority"), "theft evidence boundary missing");
assert(!theftMd.includes("answer_safe: true"), "theft demo must not be answer_safe");

let parsed = {};
try {
  parsed = JSON.parse(theftJson || "{}");
} catch (error) {
  errors.push("theft_case_corpus_l35_answer.json is invalid JSON");
}
assert(parsed.case_law_research?.answer_layer_status === "research_only", "theft JSON case law status must be research_only");
assert(parsed.audit_trail?.paragraph_proof_audit?.all_case_corpus_output_research_only === true, "theft JSON paragraph proof boundary missing");

assert(probateMd.includes("No case-by-case authority is attached") || probateMd.includes("No source-grounded case-corpus authority"), "probate demo must remain case-corpus bounded");
assert(probateMd.includes("probate") && probateMd.includes("statute"), "probate demo should remain statute-first in full answer");
assert(!probateMd.includes("answer_safe: true"), "probate demo must not be answer_safe");

assert(unsupportedMd.includes("unsupported_general_query"), "unsupported demo missing unsupported mode");
assert(unsupportedMd.includes("No case-law application is made") || unsupportedMd.includes("No source-grounded case-corpus authority"), "unsupported demo must not assert case law");
assert(!unsupportedMd.includes("HKSAR v Chan"), "unsupported demo must not cite theft case as authority");
assert(!unsupportedMd.includes("answer_safe: true"), "unsupported demo must not be answer_safe");

if (errors.length) {
  console.error("Case corpus L3.5 demo output validation failed:");
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log("Case corpus L3.5 demo output validation passed.");
