#!/usr/bin/env node
/* Level 2 law-tree pack eval: API inquiry retrieves and applies paragraph evidence. */

const fs = require("fs");
const path = require("path");
const handler = require("../api/search-evidence.js");
const { loadLawTreeCaseFruitPacks } = require("../src/case_graph/law_tree_case_fruit_packs");
const {
  extractAuthorityItemsFromSearchPayload,
  hasVerifiedPublicParagraphAuthority,
} = require("../src/case_graph/verified_case_authority");

const ROOT = path.resolve(__dirname, "..");
const OUT_JSON = path.join(ROOT, "artifacts", "law_tree_case_fruit_level2_eval.json");
const OUT_MD = path.join(ROOT, "artifacts", "law_tree_case_fruit_level2_eval.md");
const GENERATED_AT = "2026-07-01T00:00:00+08:00";

function write(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text);
}

function localPost(query) {
  return new Promise((resolve, reject) => {
    const req = { method: "POST", body: { query } };
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        if (this.statusCode >= 400) reject(new Error(`HTTP ${this.statusCode}: ${JSON.stringify(payload)}`));
        else resolve(payload);
      },
    };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

function treeHasExpectedEvidence(tree, payload) {
  const combined = JSON.stringify(payload).toLowerCase();
  return [tree.tree_id, tree.label, ...(tree.keywords || [])].some(item => combined.includes(String(item).toLowerCase()));
}

async function evaluateTree(tree) {
  const query = tree.query_examples?.[0] || tree.fact_pattern_query || tree.label;
  const payload = await localPost(query);
  const { fromMatches, fromAnalysis } = extractAuthorityItemsFromSearchPayload(payload);
  const combined = JSON.stringify(payload);
  const checks = {
    relevant_cases_retrieved: fromMatches.length > 0,
    all_retrieved_cases_verified: fromMatches.every(hasVerifiedPublicParagraphAuthority),
    paragraph_links_present: /https:\/\/(?:www\.hklii\.hk|legalref\.judiciary\.hk|legalref\.judiciary\.gov\.hk|www\.judiciary\.hk)[^"]*#p\d+/i.test(combined),
    paragraphs_quoted: /supporting_quote|exact_quote/i.test(combined),
    legal_issue_explained: treeHasExpectedEvidence(tree, payload),
    facts_applied: /application|use only the retrieved public paragraph links|research-prototype/i.test(combined),
    missing_facts_identified: /missing facts|current-treatment|current treatment|full judgment|follow-up/i.test(combined),
    irrelevant_authorities_avoided: !/landlord|tenancy|rent increase/i.test(combined),
    analysis_not_abstained: payload.inquiry_analysis?.abstain === false,
    analysis_case_refs_verified: (fromAnalysis || []).every(hasVerifiedPublicParagraphAuthority),
  };
  return {
    tree_id: tree.tree_id,
    query,
    passed: Object.values(checks).every(Boolean),
    checks,
    evidence_count: payload.evidence_count || 0,
    analysis_status: payload.analysis_status || "",
    top_cases: (payload.inquiry_analysis?.case_references || []).slice(0, 4).map(item => ({
      case_name: item.case_name,
      citation: item.neutral_citation,
      para_no: item.para_no,
      source_url: item.source_url,
    })),
  };
}

(async () => {
  const pack = loadLawTreeCaseFruitPacks();
  const results = [];
  for (const tree of pack.trees || []) {
    results.push(await evaluateTree(tree));
  }
  const passedCount = results.filter(item => item.passed).length;
  const report = {
    report_id: "law_tree_case_fruit_level2_eval_v1",
    generated_at: GENERATED_AT,
    pass: passedCount === results.length,
    tree_count: results.length,
    passed_tree_count: passedCount,
    failed_tree_count: results.length - passedCount,
    results,
  };
  write(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`);
  write(OUT_MD, [
    "# Law-Tree Case Fruit Level 2 Eval",
    "",
    `Generated: ${report.generated_at}`,
    "",
    `Pass: **${report.pass ? "yes" : "no"}** (${passedCount}/${results.length})`,
    "",
    "| Tree | Result | Evidence | Analysis |",
    "|---|---|---:|---|",
    ...results.map(result => `| ${result.tree_id} | ${result.passed ? "pass" : "fail"} | ${result.evidence_count} | ${result.analysis_status || "-"} |`),
    "",
  ].join("\n"));

  if (!report.pass) {
    console.error("Law-tree Level 2 eval failed:");
    results.filter(item => !item.passed).forEach(item => console.error(`- ${item.tree_id}: ${JSON.stringify(item.checks)}`));
    process.exit(1);
  }
  console.log(`Law-tree Level 2 eval passed (${passedCount}/${results.length}).`);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
