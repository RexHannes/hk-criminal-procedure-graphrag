#!/usr/bin/env node
/* Level 2: test AI Inquiry uses paragraph-linked evidence and abstains for unsupported domain. */

const fs = require("fs");
const path = require("path");
const handler = require("../api/search-evidence.js");
const {
  extractAuthorityItemsFromSearchPayload,
  hasVerifiedPublicParagraphAuthority,
} = require("../src/case_graph/verified_case_authority");

const ROOT = path.resolve(__dirname, "..");
const OUT_JSON = path.join(ROOT, "artifacts", "ai_inquiry_level2_eval.json");
const OUT_MD = path.join(ROOT, "artifacts", "ai_inquiry_level2_eval.md");
const GENERATED_AT = "2026-07-01T00:00:00+08:00";

const QUERIES = [
  { id: "peaceful_protest", query: "I joined a peaceful protest and police restricted the route. What legal issues matter?", supported: true, expected: /public_order|assembly|Leung|Tong Wai Hung/i },
  { id: "forgot_to_pay", query: "I picked up goods in a shop, forgot to pay, and left. What theft issues matter?", supported: true, expected: /theft|dishonest|appropriation/i },
  { id: "intention_return_item", query: "What does intention permanently to deprive mean if I planned to return the item?", supported: true, expected: /permanently|deprive|theft/i },
  { id: "belonging_thought_mine", query: "The property was in someone else's possession, but I thought it was mine. What theft issue is this?", supported: true, expected: /belonging|property|theft/i },
  { id: "bail_theft", query: "What bail factors matter after a theft arrest?", supported: true, expected: /bail|recognizance|remand|custody/i },
  { id: "interview_rights", query: "The police interviewed me without explaining my rights. What issues matter?", supported: true, expected: /Lam Tat Ming|caution|right of silence|confession/i },
  { id: "unsupported_landlord", query: "My landlord increased my rent. What should I do?", supported: false },
];

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

function validateSupported(spec, payload) {
  const { fromMatches, fromAnalysis } = extractAuthorityItemsFromSearchPayload(payload);
  const combined = JSON.stringify(payload);
  const checks = {
    retrieved_paragraph_linked_authorities: fromMatches.length > 0,
    all_matched_authorities_verified: fromMatches.every(hasVerifiedPublicParagraphAuthority),
    analysis_present: Boolean(payload.inquiry_analysis),
    analysis_not_abstained: payload.inquiry_analysis?.abstain === false,
    analysis_has_case_references: (payload.inquiry_analysis?.case_references || []).length > 0,
    all_analysis_authorities_verified: fromAnalysis.every(hasVerifiedPublicParagraphAuthority),
    quotes_present: /supporting_quote|exact_quote/.test(combined),
    source_urls_present: /https:\/\/(?:www\.hklii\.hk|legalref\.judiciary\.hk)[^"]*#p\d+/.test(combined),
    useful_issue_match: spec.expected.test(combined),
    no_unresolved_seed_authority: !/source_proof_not_attached|not_source_proofed_seed/.test(combined),
  };
  return checks;
}

function validateUnsupported(payload) {
  return {
    abstained: payload.inquiry_analysis?.abstain === true,
    no_evidence_count: payload.evidence_count === 0,
    no_matched_nodes: (payload.matched_doctrine_nodes || []).length === 0,
    unsupported_mode: payload.product_mode?.mode === "unsupported_general_query",
    no_criminal_authority_leak: !/https:\/\/(?:www\.hklii\.hk|legalref\.judiciary\.hk)[^"]*#p\d+/.test(JSON.stringify(payload)),
  };
}

(async () => {
  const results = [];
  for (const spec of QUERIES) {
    const payload = await localPost(spec.query);
    const checks = spec.supported ? validateSupported(spec, payload) : validateUnsupported(payload);
    const passed = Object.values(checks).every(Boolean);
    results.push({
      id: spec.id,
      query: spec.query,
      supported: spec.supported,
      passed,
      checks,
      evidence_count: payload.evidence_count || 0,
      product_mode: payload.product_mode?.mode || "",
      analysis_status: payload.analysis_status || "",
      top_cases: (payload.inquiry_analysis?.case_references || []).slice(0, 4).map(item => ({
        case_name: item.case_name,
        citation: item.neutral_citation,
        para_no: item.para_no,
        source_url: item.source_url,
      })),
    });
  }
  const passedCount = results.filter(item => item.passed).length;
  const report = {
    report_id: "ai_inquiry_level2_eval_v1",
    generated_at: GENERATED_AT,
    pass: passedCount === results.length,
    query_count: results.length,
    passed_query_count: passedCount,
    failed_query_count: results.length - passedCount,
    results,
  };
  write(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`);
  write(OUT_MD, [
    "# AI Inquiry Level 2 Eval",
    "",
    `Generated: ${report.generated_at}`,
    "",
    `Pass: **${report.pass ? "yes" : "no"}** (${passedCount}/${results.length})`,
    "",
    "| Query | Supported | Result | Evidence | Analysis |",
    "|---|---:|---|---:|---|",
    ...results.map(result => `| ${result.query.replace(/\|/g, "\\|")} | ${result.supported ? "yes" : "no"} | ${result.passed ? "pass" : "fail"} | ${result.evidence_count} | ${result.analysis_status || "-"} |`),
    "",
  ].join("\n"));

  if (!report.pass) {
    console.error("AI Inquiry Level 2 eval failed:");
    results.filter(item => !item.passed).forEach(item => console.error(`- ${item.id}: ${JSON.stringify(item.checks)}`));
    process.exit(1);
  }
  console.log(`AI Inquiry Level 2 eval passed (${passedCount}/${results.length}).`);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
