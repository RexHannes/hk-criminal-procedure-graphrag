#!/usr/bin/env node
/* Level 1 law-tree pack eval: exact recall and source proof. */

const fs = require("fs");
const path = require("path");
const {
  hasVerifiedPublicParagraphAuthority,
  principleSummaryForAuthority,
} = require("../src/case_graph/verified_case_authority");
const { loadLawTreeCaseFruitPacks, searchLawTreeCaseFruitPacks } = require("../src/case_graph/law_tree_case_fruit_packs");

const ROOT = path.resolve(__dirname, "..");
const OUT_JSON = path.join(ROOT, "artifacts", "law_tree_case_fruit_level1_eval.json");
const OUT_MD = path.join(ROOT, "artifacts", "law_tree_case_fruit_level1_eval.md");
const GENERATED_AT = "2026-07-01T00:00:00+08:00";

function write(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text);
}

function evaluateTree(tree) {
  const first = (tree.verified_authorities || [])[0];
  const exactQuery = first ? `${first.case_name} ${first.citation}` : tree.label;
  const searchResults = searchLawTreeCaseFruitPacks(exactQuery, 4);
  const matchedTree = searchResults.find(item => item.matched_via?.some(via => via.id === tree.tree_id)) || searchResults[0];
  const allAuthoritiesVerified = (tree.verified_authorities || []).every(hasVerifiedPublicParagraphAuthority);
  const checks = {
    tree_has_authorities: (tree.verified_authorities || []).length > 0,
    exact_case_recall: Boolean(matchedTree && JSON.stringify(matchedTree).includes(first?.case_name || "")),
    source_url_present: Boolean(first?.source_url && /hklii\.hk|legalref\.judiciary\.hk|judiciary\.hk/i.test(first.source_url)),
    paragraph_number_present: Boolean(first?.para_no || first?.paragraph_number),
    paragraph_anchor_present: Boolean(first?.source_url && /#p\d+/i.test(first.source_url)),
    quote_exactness: Boolean(first && hasVerifiedPublicParagraphAuthority(first)),
    principle_summary_present: Boolean(first && principleSummaryForAuthority(first)),
    all_authorities_verified: allAuthoritiesVerified,
  };
  return {
    tree_id: tree.tree_id,
    query: exactQuery,
    passed: Object.values(checks).every(Boolean),
    checks,
    returned_authority_count: matchedTree?.evidence?.length || 0,
    first_authority: first ? {
      case_name: first.case_name,
      citation: first.citation,
      para_no: first.para_no,
      source_url: first.source_url,
    } : null,
  };
}

const pack = loadLawTreeCaseFruitPacks();
const results = (pack.trees || []).map(evaluateTree);
const passedCount = results.filter(item => item.passed).length;
const report = {
  report_id: "law_tree_case_fruit_level1_eval_v1",
  generated_at: GENERATED_AT,
  pass: passedCount === results.length,
  tree_count: results.length,
  passed_tree_count: passedCount,
  failed_tree_count: results.length - passedCount,
  results,
};

write(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`);
write(OUT_MD, [
  "# Law-Tree Case Fruit Level 1 Eval",
  "",
  `Generated: ${report.generated_at}`,
  "",
  `Pass: **${report.pass ? "yes" : "no"}** (${passedCount}/${results.length})`,
  "",
  "| Tree | Result | First authority |",
  "|---|---|---|",
  ...results.map(result => `| ${result.tree_id} | ${result.passed ? "pass" : "fail"} | ${result.first_authority ? `${result.first_authority.case_name} ${result.first_authority.citation} para ${result.first_authority.para_no}`.replace(/\|/g, "\\|") : "-"} |`),
  "",
].join("\n"));

if (!report.pass) {
  console.error("Law-tree Level 1 eval failed:");
  results.filter(item => !item.passed).forEach(item => console.error(`- ${item.tree_id}: ${JSON.stringify(item.checks)}`));
  process.exit(1);
}

console.log(`Law-tree Level 1 eval passed (${passedCount}/${results.length}).`);
