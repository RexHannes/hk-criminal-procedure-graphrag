#!/usr/bin/env node
/* Issue coverage audit for the current 100-case sample; no scaling. */

const fs = require("fs");
const path = require("path");
const {
  ROOT,
  loadCaseCorpus,
} = require("../src/legal_answer/case_corpus/case_corpus_store");

const OUT_JSON = path.join(ROOT, "artifacts", "case_corpus_issue_coverage.json");
const OUT_MD = path.join(ROOT, "artifacts", "case_corpus_issue_coverage.md");
const STATUS_JSON = path.join(ROOT, "artifacts", "case_corpus_l1_l35_status.json");
const STATUS_MD = path.join(ROOT, "artifacts", "case_corpus_l1_l35_status.md");

const TARGET_ISSUES = [
  ["criminal_law.theft", "criminal_law.theft"],
  ["theft.dishonesty", "criminal_law.theft.dishonesty"],
  ["theft.mens_rea", "criminal_law.theft.mens_rea"],
  ["theft.appropriation", "criminal_law.theft.appropriation"],
  ["theft.belonging_to_another", "criminal_law.theft.belonging_to_another"],
  ["theft.intention_permanently_deprive", "criminal_law.theft.intention_permanently_deprive"],
  ["theft.sentencing", "criminal_law.theft.sentencing"],
  ["fraud", "criminal_law.fraud"],
  ["deception", "criminal_law.deception"],
  ["interview/caution", "criminal_procedure.interview_caution"],
  ["bail", "criminal_procedure.bail"],
];

function band(caseCount) {
  if (caseCount < 10) return "weak";
  if (caseCount < 25) return "medium";
  return "demo-credible";
}

function updateStatus(report) {
  const status = fs.existsSync(STATUS_JSON) ? JSON.parse(fs.readFileSync(STATUS_JSON, "utf8")) : {};
  status.weak_issue_tags = report.coverage.filter(item => item.coverage_band === "weak").map(item => item.issue_id);
  status.medium_issue_tags = report.coverage.filter(item => item.coverage_band === "medium").map(item => item.issue_id);
  status.demo_credible_issue_tags = report.coverage.filter(item => item.coverage_band === "demo-credible").map(item => item.issue_id);
  status.next_target_500_cases = "Before scaling to 500, prioritize weak/medium issue tags, especially belonging_to_another, intention_permanently_deprive, bail, and dishonesty/mens_rea.";
  fs.writeFileSync(STATUS_JSON, `${JSON.stringify(status, null, 2)}\n`, "utf8");

  if (fs.existsSync(STATUS_MD)) {
    const original = fs.readFileSync(STATUS_MD, "utf8").replace(/\n## Issue Coverage Audit[\s\S]*?(?=\n## |\n?$)/m, "").trimEnd();
    const lines = [
      original,
      "",
      "## Issue Coverage Audit",
      "",
      "| Issue | Cases | Coverage |",
      "|---|---:|---|",
      ...report.coverage.map(item => `| ${item.issue_id} | ${item.case_count} | ${item.coverage_band} |`),
      "",
      `Weak issue tags: ${status.weak_issue_tags.join(", ") || "none"}.`,
      "",
    ];
    fs.writeFileSync(STATUS_MD, `${lines.join("\n")}`, "utf8");
  }
}

function main() {
  const corpus = loadCaseCorpus({ mode: "sample" });
  const issueToCases = new Map();
  for (const item of corpus.issueMap) {
    if (!issueToCases.has(item.issue_id)) issueToCases.set(item.issue_id, new Set());
    issueToCases.get(item.issue_id).add(item.case_id);
  }
  const coverage = TARGET_ISSUES.map(([label, issueId]) => {
    const caseIds = Array.from(issueToCases.get(issueId) || []).sort();
    return {
      label,
      issue_id: issueId,
      case_count: caseIds.length,
      coverage_band: band(caseIds.length),
      sample_case_ids: caseIds.slice(0, 10),
    };
  });
  const report = {
    report_id: "case_corpus_issue_coverage_sample_v1",
    generated_at: "2026-06-29T00:00:00.000Z",
    scope: "Current targeted L1-L3.5 criminal-law sample only; no 500-case scaling.",
    thresholds: {
      weak: "fewer than 10 cases",
      medium: "10-24 cases",
      demo_credible: "25+ cases",
    },
    coverage,
    weak_issue_tags: coverage.filter(item => item.coverage_band === "weak").map(item => item.issue_id),
    medium_issue_tags: coverage.filter(item => item.coverage_band === "medium").map(item => item.issue_id),
    demo_credible_issue_tags: coverage.filter(item => item.coverage_band === "demo-credible").map(item => item.issue_id),
  };
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(OUT_MD, `${[
    "# Case Corpus Issue Coverage",
    "",
    report.scope,
    "",
    "| Issue | Cases | Coverage |",
    "|---|---:|---|",
    ...coverage.map(item => `| ${item.issue_id} | ${item.case_count} | ${item.coverage_band} |`),
    "",
    "## Scale Guidance",
    "",
    report.weak_issue_tags.length
      ? "- Weak issues need targeted discovery before 500-case scaling."
      : "- No target issue remains weak; medium issues still need lawyer review and more coverage before 500-case scaling.",
    "- Demo-credible issues can support investor-facing research-only demos.",
    "- No issue is answer-safe without L4 review.",
    "",
  ].join("\n")}\n`, "utf8");
  updateStatus(report);
  console.log(JSON.stringify({ script: "report_case_corpus_issue_coverage", weak_issue_tags: report.weak_issue_tags, status: "passed" }, null, 2));
}

main();
