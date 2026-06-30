#!/usr/bin/env node
/* Summarize the source-linked case authority bridge and eval outcomes. */

const fs = require("fs");
const path = require("path");
const { writeCaseAuthorityRegistry } = require("../src/case_graph/case_authority_bridge");

const ROOT = path.resolve(__dirname, "..");
const OUT_JSON = path.join(ROOT, "artifacts", "case_authority_final_report.json");
const OUT_MD = path.join(ROOT, "artifacts", "case_authority_final_report.md");
const GENERATED_AT = "2026-07-01T00:00:00+08:00";

function readJson(relativePath, fallback = null) {
  const filePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function write(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text);
}

const registry = writeCaseAuthorityRegistry();
const inventory = readJson("artifacts/all_visible_case_seed_inventory.json");
const level1 = readJson("artifacts/case_recall_level1_eval.json");
const level2 = readJson("artifacts/ai_inquiry_level2_eval.json");
const sourceUrls = new Set((registry.authorities || []).map(item => item.source_url).filter(Boolean));
const exactQuotes = (registry.authorities || []).filter(item => item.exact_quote || item.supporting_quote).length;
const summaries = (registry.authorities || []).filter(item => item.principle_text || item.proposition_text).length;

const counts = {
  total_case_like_records_inventoried: registry.counts.scanned_case_seed_count,
  paragraph_linked_public_source_records: registry.counts.verified_authority_count,
  product_visible_verified_case_seeds: registry.counts.source_linked_case_seed_count,
  doctrine_nodes_with_verified_evidence: registry.counts.doctrine_node_count,
  excluded_unresolved_seeds: registry.counts.excluded_case_seed_count,
  visible_unverified_authorities: inventory?.counts?.visible_unverified_authorities ?? 0,
  backend_searchable_unverified_authorities: inventory?.counts?.backend_searchable_unverified_authorities ?? 0,
  hklii_legalref_judiciary_links: sourceUrls.size,
  exact_quotes: exactQuotes,
  short_summaries: summaries,
};

const report = {
  report_id: "case_authority_final_report_v1",
  generated_at: GENERATED_AT,
  product_claim: "The original Fable viewer and AI Inquiry expose paragraph-linked public-source case law only. Unresolved seed cases are excluded from authority surfaces and tracked in audit.",
  counts,
  level1_case_recall: level1 ? {
    pass: level1.pass,
    passed_query_count: level1.passed_query_count,
    query_count: level1.query_count,
  } : { pass: null, note: "not run yet" },
  level2_ai_inquiry: level2 ? {
    pass: level2.pass,
    passed_query_count: level2.passed_query_count,
    query_count: level2.query_count,
  } : { pass: null, note: "not run yet" },
  remaining_limitations: [
    "Lawyer-review certification is later HITL metadata and does not block research-prototype retrieval.",
    "Unresolved seed cases remain excluded until a public paragraph link, exact quote, paragraph text, and issue mapping are attached.",
    "Current-treatment review is not completed for every source-linked paragraph.",
    "The corpus is not yet scaled to 500 or 10000 cases in this PR #6 pass.",
  ],
};

write(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`);
write(OUT_MD, [
  "# Case Authority Final Report",
  "",
  `Generated: ${report.generated_at}`,
  "",
  report.product_claim,
  "",
  "| Metric | Count |",
  "|---|---:|",
  `| Total case-like records inventoried | ${counts.total_case_like_records_inventoried} |`,
  `| Paragraph-linked public-source records | ${counts.paragraph_linked_public_source_records} |`,
  `| Product-visible verified case seeds | ${counts.product_visible_verified_case_seeds} |`,
  `| Doctrine nodes with verified evidence | ${counts.doctrine_nodes_with_verified_evidence} |`,
  `| Excluded unresolved seeds | ${counts.excluded_unresolved_seeds} |`,
  `| Visible unverified authorities | ${counts.visible_unverified_authorities} |`,
  `| Backend-searchable unverified authorities | ${counts.backend_searchable_unverified_authorities} |`,
  `| HKLII/LegalRef/Judiciary links | ${counts.hklii_legalref_judiciary_links} |`,
  `| Exact quotes | ${counts.exact_quotes} |`,
  `| Short summaries | ${counts.short_summaries} |`,
  "",
  "## Evals",
  "",
  `- Level 1 case recall: ${report.level1_case_recall.pass === null ? "not run yet" : report.level1_case_recall.pass ? "pass" : "fail"}`,
  `- Level 2 AI Inquiry: ${report.level2_ai_inquiry.pass === null ? "not run yet" : report.level2_ai_inquiry.pass ? "pass" : "fail"}`,
  "",
  "## Remaining Limitations",
  "",
  ...report.remaining_limitations.map(item => `- ${item}`),
  "",
].join("\n"));

console.log("Case authority final report generated.");
