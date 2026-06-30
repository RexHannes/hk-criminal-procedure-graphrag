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
const theftTable = read("theft_dishonesty_case_law_table.md");
const authoritiesTable = read("case_corpus_sample_authorities_table.md");
const theftDishonestyMemo = read("theft_dishonesty_research_memo.md");
const forgotEvidence = read("forgot_to_pay_with_evidence_text.md");
const sentencingBoundary = read("theft_sentencing_boundary.md");
const intentionMemo = read("intention_permanently_deprive_research_memo.md");
const belongingMemo = read("belonging_to_another_research_memo.md");
const bailMemo = read("bail_research_memo.md");
const fraudBoundary = read("fraud_dishonesty_boundary.md");
const unsupportedLandlord = read("unsupported_landlord_query.md");

assert(theftMd.includes("L1-L3.5 Case-Law Research Memo"), "theft demo missing L3.5 memo");
assert(theftMd.includes("Case-by-Case Authorities"), "theft demo missing case-by-case authorities");
assert(theftMd.includes("Exact quote:"), "theft demo missing exact quote");
assert((theftMd.match(/Source URL: https:\/\/www\.hklii\.hk\/en\/cases\/[^#\s]+#p\d+/g) || []).length >= 5, "theft demo must show at least 5 case paragraph URLs");
assert(theftMd.includes("Evidence Analysis"), "theft demo missing evidence analysis");
assert(theftMd.includes("not legal authority"), "theft evidence boundary missing");
assert(!theftMd.includes("answer_safe: true"), "theft demo must not be answer_safe");
assert(theftMd.indexOf("## Product Mode") < theftMd.indexOf("```json"), "theft demo must not expose raw JSON first");

let parsed = {};
try {
  parsed = JSON.parse(theftJson || "{}");
} catch (error) {
  errors.push("theft_case_corpus_l35_answer.json is invalid JSON");
}
assert(parsed.case_law_research?.answer_layer_status === "research_only", "theft JSON case law status must be research_only");
assert(parsed.case_law_research?.cases_returned >= 5, "theft JSON should return at least 5 case-corpus authorities");
assert(parsed.audit_trail?.case_corpus_audit?.registry_case_count >= 25, "theft JSON audit should show expanded registry count");
assert(parsed.audit_trail?.paragraph_proof_audit?.all_case_corpus_output_research_only === true, "theft JSON paragraph proof boundary missing");

assert(probateMd.includes("No case-by-case authority is attached") || probateMd.includes("No source-grounded case-corpus authority"), "probate demo must remain case-corpus bounded");
assert(probateMd.includes("probate") && probateMd.includes("statute"), "probate demo should remain statute-first in full answer");
assert(!probateMd.includes("answer_safe: true"), "probate demo must not be answer_safe");

assert(unsupportedMd.includes("unsupported_general_query"), "unsupported demo missing unsupported mode");
assert(unsupportedMd.includes("No case-law application is made") || unsupportedMd.includes("No source-grounded case-corpus authority"), "unsupported demo must not assert case law");
assert(!unsupportedMd.includes("HKSAR v Chan"), "unsupported demo must not cite theft case as authority");
assert(!/Source URL: https:\/\/www\.hklii\.hk\/en\/cases\//.test(unsupportedMd), "unsupported demo must not cite case-corpus authorities");
assert(!unsupportedMd.includes("answer_safe: true"), "unsupported demo must not be answer_safe");

assert(theftTable.includes("Actual listed cases:") && theftTable.includes("research-only"), "theft table missing count/status");
assert((theftTable.match(/https:\/\/www\.hklii\.hk\/en\/cases\/[^#\s]+#p\d+/g) || []).length >= 25, "theft table should contain many paragraph-proof URLs");
assert(/Actual cases: \d+/.test(authoritiesTable), "authorities table missing actual case count");
assert((authoritiesTable.match(/^\| .*?\[20\d{2}\] HK/mg) || []).length >= 25, "authorities table should list at least 25 cases");

for (const [label, content] of [
  ["theft_dishonesty_research_memo", theftDishonestyMemo],
  ["forgot_to_pay_with_evidence_text", forgotEvidence],
  ["intention_permanently_deprive_research_memo", intentionMemo],
  ["belonging_to_another_research_memo", belongingMemo],
  ["theft_sentencing_boundary", sentencingBoundary],
  ["fraud_dishonesty_boundary", fraudBoundary],
  ["bail_research_memo", bailMemo],
]) {
  assert(content.includes("Case-by-Case Authorities"), `${label} missing case-by-case authorities`);
  assert(content.includes("Extracted Legal Principles"), `${label} missing extracted principles`);
  assert(content.includes("Application to User Facts"), `${label} missing application section`);
  assert(content.includes("Source Audit"), `${label} missing source audit`);
    assert(content.includes("Answer mode: `research_prototype`"), `${label} must show research prototype mode`);
    assert(content.includes("Professional advice certified: `false`"), `${label} must show professional certification boundary`);
  assert(!content.includes("Mode: `unsupported_general_query`"), `${label} should not present supported case-corpus research as unsupported`);
  assert((content.match(/Exact quote:/g) || []).length >= 5, `${label} must include exact paragraph quotes`);
  assert((content.match(/Source URL: https:\/\/www\.hklii\.hk\/en\/cases\/[^#\s]+#p\d+/g) || []).length >= 5, `${label} must include paragraph URLs`);
}
assert(forgotEvidence.includes("Uploaded text evidence parsed") && forgotEvidence.includes("not legal authority"), "forgot-to-pay evidence demo missing evidence analysis boundary");
assert(/permanent(?:ly)? to deprive|permanently deprive|intention/i.test(intentionMemo), "intention permanently deprive demo missing target issue language");
assert(/belong(?:ing)? to another|belonged to another|property of another/i.test(belongingMemo), "belonging-to-another demo missing target issue language");
assert(sentencingBoundary.includes("sentencing") && sentencingBoundary.includes("liability"), "sentencing boundary demo missing liability boundary");
assert(fraudBoundary.includes("fraud") || fraudBoundary.includes("deception"), "fraud boundary demo missing fraud/deception content");
assert(bailMemo.includes("bail") || bailMemo.includes("Bail"), "bail demo missing bail content");
assert(bailMemo.includes("liability") || bailMemo.includes("procedure"), "bail demo missing procedure/liability boundary");
assert(unsupportedLandlord.includes("unsupported_general_query"), "new landlord demo missing unsupported mode");
assert(!/Source URL: https:\/\/www\.hklii\.hk\/en\/cases\//.test(unsupportedLandlord), "new landlord demo must not cite case-corpus authorities");
assert(unsupportedLandlord.includes("Professional advice certified: `false`"), "new landlord demo must show professional certification boundary");

if (errors.length) {
  console.error("Case corpus L3.5 demo output validation failed:");
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log("Case corpus L3.5 demo output validation passed.");
