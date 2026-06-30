#!/usr/bin/env node
/* Validate L1 public case registry records. */

const {
  PATHS,
  readJsonl,
  publicSourceUrl,
} = require("../src/legal_answer/case_corpus/case_corpus_store");

const sampleMode = process.argv.includes("--sample");
const filePath = sampleMode ? PATHS.registrySample : PATHS.registryFull;
const records = readJsonl(filePath);
const errors = [];
const minCasesIndex = process.argv.indexOf("--min-cases");
const minCases = Number(minCasesIndex >= 0 ? process.argv[minCasesIndex + 1] : sampleMode ? "25" : "0");

function assert(condition, message) {
  if (!condition) errors.push(message);
}

const ids = new Set();
const urls = new Set();
assert(records.length >= minCases, `registry has ${records.length} case(s), below minimum ${minCases}`);
for (const [index, record] of records.entries()) {
  const label = record.case_id || `record_${index + 1}`;
  assert(record.case_id && !ids.has(record.case_id), `${label}: missing/duplicate case_id`);
  ids.add(record.case_id);
  assert(record.case_name, `${label}: missing case_name`);
  assert(/^\[\d{4}\]\s+HK[A-Z]+\s+\d+/.test(record.neutral_citation || ""), `${label}: bad neutral citation`);
  assert(record.court && /Court|Tribunal|Magistrates|Board/i.test(record.court), `${label}: court sanity failed`);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(record.judgment_date || ""), `${label}: judgment_date must be YYYY-MM-DD`);
  assert(publicSourceUrl(record.source_url), `${label}: source_url is not approved public URL`);
  assert(!urls.has(record.source_url), `${label}: duplicate source_url`);
  urls.add(record.source_url);
  if (record.legalref_url) assert(publicSourceUrl(record.legalref_url), `${label}: legalref_url is not approved public URL`);
  assert(["hklii", "legalref", "judiciary", "other_public"].includes(record.source_system), `${label}: invalid source_system`);
  assert(record.source_visibility === "public", `${label}: source_visibility must be public`);
  assert(record.answer_layer_status === "research_only", `${label}: answer_layer_status must be research_only`);
  assert(!/private|licensed|textbook|butterworth|atkin/i.test(JSON.stringify(record)), `${label}: private/licensed source marker present`);
  assert(record.answer_layer_status !== "answer_safe", `${label}: registry cannot be answer_safe`);
  assert(!/placeholder|todo|fake|sample case|case_recall_only/i.test(JSON.stringify(record)), `${label}: placeholder/recall-only marker present`);
}

if (sampleMode) {
  const sourceArtifactPath = PATHS.registrySample.replace("sample_case_registry_100.jsonl", "criminal_sample_source_cases.json");
  const fs = require("fs");
  if (!fs.existsSync(sourceArtifactPath)) {
    errors.push("missing criminal_sample_source_cases.json source artifact");
  } else {
    const sourceArtifact = JSON.parse(fs.readFileSync(sourceArtifactPath, "utf8"));
    assert(sourceArtifact.actual_case_count === records.length, "source artifact actual_case_count must match sample registry");
    assert((sourceArtifact.cases || []).length === records.length, "source artifact cases[] length must match sample registry");
    assert((sourceArtifact.cases || []).every(item => (item.selected_paragraphs || []).length >= 1), "every source case needs selected paragraph proof");
  }
}

if (errors.length) {
  console.error("Case registry validation failed:");
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log(JSON.stringify({
  validator: "validate_case_registry_10000",
  mode: sampleMode ? "sample" : "full",
  registry_case_count: records.length,
  status: "passed",
}, null, 2));
