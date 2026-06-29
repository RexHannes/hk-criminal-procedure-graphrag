#!/usr/bin/env node
/* Build research-only cards from accepted candidate extractions. */

const path = require("path");
const {
  ROOT,
  PATHS,
} = require("../src/legal_answer/case_corpus/case_corpus_store");
const {
  buildCardsFromVerificationReport,
  VERIFICATION_REPORT_JSON,
  CARD_BUILD_REPORT_JSON,
  CARD_BUILD_REPORT_MD,
} = require("../src/legal_answer/case_corpus/candidate_extraction_factory");

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const reportPath = path.resolve(ROOT, argValue("--report", VERIFICATION_REPORT_JSON));
const result = buildCardsFromVerificationReport({
  reportPath,
  outputDir: PATHS.candidateVerifiedDir,
  write: !process.argv.includes("--no-write"),
});

console.log(JSON.stringify({
  script: "build_cards_from_verified_candidates",
  source_report: path.relative(ROOT, reportPath),
  output_json: path.relative(ROOT, CARD_BUILD_REPORT_JSON),
  output_md: path.relative(ROOT, CARD_BUILD_REPORT_MD),
  manifest: result.manifest,
  status: "passed",
}, null, 2));
