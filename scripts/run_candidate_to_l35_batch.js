#!/usr/bin/env node
/* Candidate extraction -> HKLII paragraph verification -> research-only L3.5 card factory. */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const {
  ROOT,
  PATHS,
} = require("../src/legal_answer/case_corpus/case_corpus_store");
const {
  verifyCandidateExtractions,
  buildCardsFromVerificationReport,
  VERIFICATION_REPORT_JSON,
  VERIFICATION_REPORT_MD,
  CARD_BUILD_REPORT_JSON,
  CARD_BUILD_REPORT_MD,
} = require("../src/legal_answer/case_corpus/candidate_extraction_factory");

const STATUS_JSON_PATH = path.join(ROOT, "artifacts", "case_corpus_l1_l35_status.json");
const STATUS_MD_PATH = path.join(ROOT, "artifacts", "case_corpus_l1_l35_status.md");

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function artifactPath(filePath) {
  return path.relative(ROOT, filePath);
}

function updateStatusDashboard({ verificationReport, cardManifest }) {
  const status = fs.existsSync(STATUS_JSON_PATH)
    ? JSON.parse(fs.readFileSync(STATUS_JSON_PATH, "utf8"))
    : {};
  const summary = verificationReport.summary;
  status.candidate_extractions_total = summary.candidate_extractions_total;
  status.candidates_verified = summary.candidates_verified;
  status.candidates_rejected = summary.candidates_rejected;
  status.rejection_reasons = summary.rejection_reasons;
  status.verified_cases_added = summary.verified_cases_added;
  status.paragraph_cards_added = cardManifest.paragraph_cards_added;
  status.propositions_added = cardManifest.propositions_added;
  status.principles_added = cardManifest.principles_added;
  status.digests_added = cardManifest.digests_added;
  status.candidate_paragraph_cards_added = cardManifest.paragraph_cards_added;
  status.candidate_propositions_added = cardManifest.propositions_added;
  status.candidate_principles_added = cardManifest.principles_added;
  status.candidate_digests_added = cardManifest.digests_added;
  status.candidate_answer_safe_count = 0;
  status.candidate_cards_demoted = cardManifest.cards_demoted || summary.cards_demoted || 0;
  status.candidate_demotion_reasons = summary.demotion_reasons || cardManifest.demotion_reasons || {};
  status.fast_growth_workflow = "candidate_extractor_to_public_paragraph_verification_to_research_only_cards";
  fs.writeFileSync(STATUS_JSON_PATH, `${JSON.stringify(status, null, 2)}\n`, "utf8");

  if (fs.existsSync(STATUS_MD_PATH)) {
    const original = fs.readFileSync(STATUS_MD_PATH, "utf8").replace(/\n## Candidate Fast-Growth Metrics[\s\S]*$/m, "").trimEnd();
    const lines = [
      original,
      "",
      "## Candidate Fast-Growth Metrics",
      "",
      "NotebookLM, DeepSeek, Claude, GPT and manual outputs are candidate extractors only. HKLII/LegalRef paragraph verification remains the source of truth.",
      "",
      "| Metric | Value |",
      "|---|---:|",
      `| Candidate extractions total | ${summary.candidate_extractions_total} |`,
      `| Candidates verified | ${summary.candidates_verified} |`,
      `| Candidates rejected | ${summary.candidates_rejected} |`,
      `| Verified cases added | ${summary.verified_cases_added} |`,
      `| Candidate paragraph cards added | ${cardManifest.paragraph_cards_added} |`,
      `| Candidate propositions added | ${cardManifest.propositions_added} |`,
      `| Candidate principles added | ${cardManifest.principles_added} |`,
      `| Candidate digests added | ${cardManifest.digests_added} |`,
      `| Candidate cards with demotion flags | ${status.candidate_cards_demoted} |`,
      `| Candidate answer-safe count | 0 |`,
      "",
      "### Candidate Rejection Reasons",
      "",
      "| Reason | Count |",
      "|---|---:|",
      ...Object.entries(summary.rejection_reasons).map(([reason, count]) => `| ${reason} | ${count} |`),
      "",
      "### Candidate Demotion Reasons",
      "",
      "| Reason | Count |",
      "|---|---:|",
      ...Object.entries(summary.demotion_reasons || {}).map(([reason, count]) => `| ${reason} | ${count} |`),
      "",
    ];
    fs.writeFileSync(STATUS_MD_PATH, `${lines.join("\n")}`, "utf8");
  }
}

function runValidator() {
  execFileSync(process.execPath, [path.join(ROOT, "scripts", "validate_candidate_extraction_verification.js")], {
    cwd: ROOT,
    stdio: "inherit",
  });
}

function main() {
  const inputPath = path.resolve(ROOT, argValue("--input", PATHS.candidateExtractionsSample));
  const verifyOnly = hasFlag("--verify-only");
  const buildCards = hasFlag("--build-cards") || !verifyOnly;
  const verificationReport = verifyCandidateExtractions({
    inputPath,
    outputJsonPath: VERIFICATION_REPORT_JSON,
    outputMdPath: VERIFICATION_REPORT_MD,
    limit: Number(argValue("--limit", "0")),
    issue: argValue("--issue", ""),
    minimumScore: Number(argValue("--minimum-score", "0.92")),
    write: true,
  });
  const cardResult = buildCards
    ? buildCardsFromVerificationReport({ reportPath: VERIFICATION_REPORT_JSON, outputDir: PATHS.candidateVerifiedDir, write: true })
    : { manifest: { paragraph_cards_added: 0, propositions_added: 0, principles_added: 0, digests_added: 0 } };
  updateStatusDashboard({ verificationReport, cardManifest: cardResult.manifest });
  if (!verifyOnly && !hasFlag("--skip-validator")) runValidator();

  console.log(JSON.stringify({
    script: "run_candidate_to_l35_batch",
    dry_run: hasFlag("--dry-run"),
    verify_only: verifyOnly,
    build_cards: buildCards,
    fetch_missing_requested: hasFlag("--fetch-missing"),
    fetch_missing_status: hasFlag("--fetch-missing")
      ? "not_used_in_ci_missing_cases_remain_rejected_until_public_source_fetch_is_added_to_registry"
      : "not_requested",
    input: artifactPath(inputPath),
    verification_report: artifactPath(VERIFICATION_REPORT_JSON),
    cards_report: artifactPath(CARD_BUILD_REPORT_JSON),
    cards_report_md: artifactPath(CARD_BUILD_REPORT_MD),
    summary: verificationReport.summary,
    status: "passed",
  }, null, 2));
}

main();
