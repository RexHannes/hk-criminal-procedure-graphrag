#!/usr/bin/env node
/* Level 1: recall paragraph-linked authorities by case name/citation/issue. */

const fs = require("fs");
const path = require("path");
const { writeCaseAuthorityRegistry } = require("../src/case_graph/case_authority_bridge");
const {
  hasVerifiedPublicParagraphAuthority,
  normalizeAuthorityForReport,
  principleSummaryForAuthority,
} = require("../src/case_graph/verified_case_authority");

const ROOT = path.resolve(__dirname, "..");
const OUT_JSON = path.join(ROOT, "artifacts", "case_recall_level1_eval.json");
const OUT_MD = path.join(ROOT, "artifacts", "case_recall_level1_eval.md");
const GENERATED_AT = "2026-07-01T00:00:00+08:00";

const QUERIES = [
  {
    id: "leung_citation",
    query: "HKSAR v Leung Kwok Hung [2005] 3 HKLRD 164",
    expected_case: /Leung Kwok Hung/i,
    expected_citation: /\[2005\] HKCFA 2|\[2005\] 3 HKLRD 164/i,
  },
  {
    id: "leung_public_assembly",
    query: "Leung Kwok Hung public assembly proportionality",
    expected_case: /Leung Kwok Hung/i,
    expected_issue: /public_order|peaceful_assembly|assembly|restriction/i,
  },
  {
    id: "lam_confession",
    query: "Lam Tat Ming detention after arrest confession",
    expected_case: /Lam Tat Ming/i,
    expected_citation: /\(2000\) 3 HKCFAR 168/i,
  },
  {
    id: "forgot_to_pay",
    query: "forgot to pay at shop dishonesty theft",
    expected_issue: /theft|dishonesty|shoplifting/i,
  },
  {
    id: "intention_permanently_deprive",
    query: "intention permanently to deprive theft",
    expected_issue: /intention_permanently_deprive|permanently deprive|theft/i,
  },
  {
    id: "belonging_to_another",
    query: "belonging to another theft",
    expected_issue: /belonging_to_another|property|theft/i,
  },
  {
    id: "appropriation",
    query: "appropriation theft Hong Kong",
    expected_issue: /appropriation|theft/i,
  },
  {
    id: "bail",
    query: "bail factors theft dishonesty",
    expected_issue: /bail|recognizance|remand|custody/i,
  },
  {
    id: "interview_caution",
    query: "interview caution Hong Kong criminal procedure",
    expected_issue: /interview_caution|caution|right_of_silence|confession/i,
  },
];

const SYNONYMS = {
  "forgot": ["shoplifting", "dishonesty", "theft"],
  "pay": ["shoplifting", "dishonesty"],
  "permanently": ["intention_permanently_deprive", "deprive"],
  "belonging": ["belonging_to_another", "property"],
  "appropriation": ["appropriation", "appropriated"],
  "bail": ["recognizance", "remand", "custody", "refusal"],
  "interview": ["caution", "confession", "right_of_silence"],
  "rights": ["caution", "right_of_silence", "confession"],
  "assembly": ["public_order", "peaceful_assembly", "restriction"],
  "proportionality": ["necessity", "restriction", "peaceful_assembly"],
};

function write(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text);
}

function tokenize(text) {
  const base = String(text || "").toLowerCase().split(/[^a-z0-9]+/).filter(token => token.length > 1);
  const expanded = [];
  for (const token of base) {
    expanded.push(token);
    expanded.push(...(SYNONYMS[token] || []));
  }
  return Array.from(new Set(expanded));
}

function searchText(authority) {
  return [
    authority.case_name,
    authority.neutral_citation,
    authority.law_report_citation,
    authority.citation,
    authority.para_no,
    authority.paragraph_number,
    authority.source_url,
    authority.exact_quote,
    authority.supporting_quote,
    authority.paragraph_text,
    authority.principle_text,
    authority.proposition_text,
    authority.authority_role,
    ...(authority.issue_tags || []),
    ...(authority.doctrine_node_ids || []),
  ].filter(Boolean).join(" ").toLowerCase();
}

function scoreAuthority(authority, query) {
  const text = searchText(authority);
  const terms = tokenize(query);
  let score = 0;
  for (const term of terms) {
    if (text.includes(term)) score += 1;
    if (String(authority.case_name || "").toLowerCase().includes(term)) score += 4;
    if ((authority.issue_tags || []).join(" ").toLowerCase().includes(term)) score += 3;
    if ((authority.doctrine_node_ids || []).join(" ").toLowerCase().includes(term)) score += 2;
  }
  if (hasVerifiedPublicParagraphAuthority(authority)) score += 3;
  return score;
}

function evaluateQuery(querySpec, authorities) {
  const ranked = authorities
    .map(authority => ({ authority, score: scoreAuthority(authority, querySpec.query) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(item => item.authority);
  const top = ranked[0];
  const combinedTop10 = JSON.stringify(ranked);
  const checks = {
    has_result: ranked.length > 0,
    correct_case: querySpec.expected_case ? querySpec.expected_case.test(combinedTop10) : true,
    correct_citation: querySpec.expected_citation ? querySpec.expected_citation.test(combinedTop10) : true,
    correct_issue: querySpec.expected_issue ? querySpec.expected_issue.test(combinedTop10) : true,
    public_source_url: ranked.some(item => /hklii\.hk|legalref\.judiciary\.hk|judiciary\.hk/i.test(item.source_url || "")),
    paragraph_anchor: ranked.some(item => /#p\d+/i.test(item.source_url || "")),
    exact_quote_verified: ranked.some(hasVerifiedPublicParagraphAuthority),
    short_summary: ranked.some(principleSummaryForAuthority),
    no_unresolved_seed_authority: ranked.every(hasVerifiedPublicParagraphAuthority),
  };
  const passed = Object.values(checks).every(Boolean);
  return {
    id: querySpec.id,
    query: querySpec.query,
    passed,
    checks,
    top_results: ranked.slice(0, 5).map(normalizeAuthorityForReport),
    top_result: top ? normalizeAuthorityForReport(top) : null,
  };
}

const registry = writeCaseAuthorityRegistry();
const authorities = registry.authorities || [];
const results = QUERIES.map(query => evaluateQuery(query, authorities));
const passed = results.filter(item => item.passed).length;
const report = {
  report_id: "case_recall_level1_eval_v1",
  generated_at: GENERATED_AT,
  pass: passed === results.length,
  query_count: results.length,
  passed_query_count: passed,
  failed_query_count: results.length - passed,
  results,
};

write(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`);
write(OUT_MD, [
  "# Case Recall Level 1 Eval",
  "",
  `Generated: ${report.generated_at}`,
  "",
  `Pass: **${report.pass ? "yes" : "no"}** (${passed}/${results.length})`,
  "",
  "| Query | Result | Top authority |",
  "|---|---|---|",
  ...results.map(result => `| ${result.query.replace(/\|/g, "\\|")} | ${result.passed ? "pass" : "fail"} | ${result.top_result ? `${result.top_result.case_name} ${result.top_result.citation} para ${result.top_result.paragraph_number}`.replace(/\|/g, "\\|") : "-"} |`),
  "",
].join("\n"));

if (!report.pass) {
  console.error("Case recall Level 1 eval failed:");
  results.filter(item => !item.passed).forEach(item => console.error(`- ${item.id}: ${JSON.stringify(item.checks)}`));
  process.exit(1);
}

console.log(`Case recall Level 1 eval passed (${passed}/${results.length}).`);
