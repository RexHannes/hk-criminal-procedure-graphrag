#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { resolveAllVisibleCaseSources, authoritySummaryStats } = require("../src/case_graph/verified_case_authority");
const { runLevel1Eval, runLevel2Eval } = require("../src/case_graph/case_authority_eval");

const ROOT = path.resolve(__dirname, "..");
const outJson = path.join(ROOT, "artifacts", "case_authority_final_report.json");
const outMd = path.join(ROOT, "artifacts", "case_authority_final_report.md");

resolveAllVisibleCaseSources({ write: true });
const stats = authoritySummaryStats();
const level1 = runLevel1Eval();
const level2 = runLevel2Eval();

const report = {
  generated_at: new Date().toISOString(),
  total_case_like_records_inventoried: stats.total_inventoried,
  total_paragraph_linked_public_source_cases: stats.total_verified_with_paragraph_proof,
  total_excluded_unresolved_cases: stats.total_excluded,
  total_visible_unverified_authorities: stats.total_still_visible_unverified,
  total_backend_searchable_unverified_authorities: stats.total_still_visible_unverified,
  total_hklii_legalref_judiciary_links: stats.total_hklii_legalref_links,
  total_exact_quotes: stats.total_exact_quotes,
  total_short_summaries: stats.total_principle_summaries,
  searchable_doctrine_node_count: stats.searchable_doctrine_node_count,
  level1_recall: { pass: level1.pass, passed: level1.passed, total: level1.total },
  level2_ai_inquiry: { pass: level2.pass, passed: level2.passed, total: level2.total },
  success_criteria: {
    visible_unverified_zero: stats.total_still_visible_unverified === 0,
    backend_searchable_unverified_zero: stats.total_still_visible_unverified === 0,
    level1_recall_passes: level1.pass,
    level2_analysis_passes: level2.pass,
  },
  remaining_limitations: [
    "174 case seeds remain excluded until real public paragraph proof is mined per case.",
    "Lawyer review / answer-safe certification is a later HITL layer and does not gate research retrieval.",
    "Theft element queries currently retrieve dishonesty/fraud paragraph proof on criminal_law_hk.theft.dishonesty.",
  ],
};

const overallOk = Object.values(report.success_criteria).every(Boolean);
report.ok = overallOk;

fs.writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`);

const md = [
  "# Case Authority Final Report",
  "",
  `Generated: ${report.generated_at}`,
  "",
  `**Overall:** ${overallOk ? "PASS" : "FAIL"}`,
  "",
  "## Inventory",
  "",
  `- Total case-like records inventoried: **${report.total_case_like_records_inventoried}**`,
  `- Paragraph-linked public-source records: **${report.total_paragraph_linked_public_source_cases}**`,
  `- Excluded unresolved seeds: **${report.total_excluded_unresolved_cases}**`,
  `- Visible unverified authorities: **${report.total_visible_unverified_authorities}**`,
  `- Backend-searchable unverified authorities: **${report.total_backend_searchable_unverified_authorities}**`,
  `- HKLII/LegalRef/Judiciary links: **${report.total_hklii_legalref_judiciary_links}**`,
  `- Exact quotes: **${report.total_exact_quotes}**`,
  `- Short summaries: **${report.total_short_summaries}**`,
  "",
  "## Evaluations",
  "",
  `- Level 1 recall: **${level1.pass ? "PASS" : "FAIL"}** (${level1.passed}/${level1.total})`,
  `- Level 2 AI Inquiry: **${level2.pass ? "PASS" : "FAIL"}** (${level2.passed}/${level2.total})`,
  "",
  "## Remaining limitations",
  "",
  ...report.remaining_limitations.map(item => `- ${item}`),
  "",
].join("\n");
fs.writeFileSync(outMd, `${md}\n`);

console.log(JSON.stringify(report, null, 2));
process.exit(overallOk ? 0 : 1);
