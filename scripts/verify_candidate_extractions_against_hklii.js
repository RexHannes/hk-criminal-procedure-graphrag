#!/usr/bin/env node
/* Verify AI/manual candidate extractions against committed public HKLII paragraph proof. */

const path = require("path");
const {
  ROOT,
  PATHS,
} = require("../src/legal_answer/case_corpus/case_corpus_store");
const {
  verifyCandidateExtractions,
  VERIFICATION_REPORT_JSON,
  VERIFICATION_REPORT_MD,
} = require("../src/legal_answer/case_corpus/candidate_extraction_factory");

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

const input = argValue("--input", PATHS.candidateExtractionsSample);
const report = verifyCandidateExtractions({
  inputPath: path.resolve(ROOT, input),
  outputJsonPath: VERIFICATION_REPORT_JSON,
  outputMdPath: VERIFICATION_REPORT_MD,
  limit: Number(argValue("--limit", "0")),
  issue: argValue("--issue", ""),
  minimumScore: Number(argValue("--minimum-score", "0.92")),
  write: !hasFlag("--no-write"),
});

console.log(JSON.stringify({
  script: "verify_candidate_extractions_against_hklii",
  input: path.relative(ROOT, path.resolve(ROOT, input)),
  output_json: path.relative(ROOT, VERIFICATION_REPORT_JSON),
  output_md: path.relative(ROOT, VERIFICATION_REPORT_MD),
  fetch_missing_requested: hasFlag("--fetch-missing"),
  fetch_missing_status: hasFlag("--fetch-missing")
    ? "not_used_in_ci_missing_cases_remain_rejected_until_public_source_fetch_is_added_to_registry"
    : "not_requested",
  summary: report.summary,
  status: "passed",
}, null, 2));
