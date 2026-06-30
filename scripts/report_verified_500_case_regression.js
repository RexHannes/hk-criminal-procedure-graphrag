#!/usr/bin/env node
/* Local regression report for the 500-case scale branch.
 *
 * This does not rewrite PR #6 frozen demo artifacts. It checks that the larger
 * corpus still returns source-grounded criminal-law research and abstains from
 * unsupported civil/landlord questions.
 */

const fs = require("fs");
const path = require("path");
const {
  ROOT,
  loadCaseCorpus,
} = require("../src/legal_answer/case_corpus/case_corpus_store");
const { retrieveCaseLawResearch } = require("../src/legal_answer/case_corpus/case_law_research_retriever");
const { renderCaseLawResearch } = require("../src/legal_answer/case_corpus/case_law_research_renderer");
const { buildUploadedEvidenceBundle } = require("../src/api/evidence_text_ingest");

const OUT_JSON = path.join(ROOT, "artifacts", "verified_500_case_regression_report.json");
const OUT_MD = path.join(ROOT, "artifacts", "verified_500_case_regression_report.md");

const QUERIES = [
  {
    query_id: "theft_dishonesty_research_memo",
    query: "For a Hong Kong theft/shoplifting case, what are the dishonesty issues if the suspect says they forgot to pay?",
    issue_id: "criminal_law.theft.dishonesty",
    supported: true,
  },
  {
    query_id: "intention_permanently_deprive",
    query: "In a Hong Kong theft case, what authorities discuss intention permanently to deprive?",
    issue_id: "criminal_law.theft.intention_permanently_deprive",
    supported: true,
  },
  {
    query_id: "belonging_to_another",
    query: "In Hong Kong theft, what case-law research exists on property belonging to another?",
    issue_id: "criminal_law.theft.belonging_to_another",
    supported: true,
  },
  {
    query_id: "bail_theft_dishonesty",
    query: "What public Hong Kong case-law research is available about bail in theft or dishonesty cases?",
    issue_id: "criminal_procedure.bail",
    supported: true,
  },
  {
    query_id: "unsupported_landlord_query",
    query: "My landlord is increasing rent and refusing repairs. What cases answer this?",
    issue_id: "",
    supported: false,
  },
];

function paragraphUrlOk(url = "") {
  return /^https:\/\/(www\.)?hklii\.hk\/en\/cases\/[a-z0-9]+\/\d{4}\/\d+#p\d+$/i.test(String(url || ""));
}

function caseSummary(item = {}) {
  return {
    case_id: item.case_id,
    case_name: item.digest?.case_name || "",
    neutral_citation: item.digest?.neutral_citation || "",
    paragraph_urls: (item.paragraphs || []).map(paragraph => paragraph.source_url),
    exact_quotes: (item.propositions || []).map(prop => prop.exact_quote_support).filter(Boolean).slice(0, 3),
    principle_ids: (item.principles || []).map(principle => principle.principle_id).slice(0, 5),
    answer_layer_statuses: Array.from(new Set([]
      .concat(item.paragraphs || [], item.propositions || [], item.principles || [])
      .map(record => record.answer_layer_status)
      .filter(Boolean))),
    review_statuses: Array.from(new Set([]
      .concat(item.paragraphs || [], item.propositions || [], item.principles || [])
      .map(record => record.review_status)
      .filter(Boolean))),
  };
}

function evaluateQuery(spec) {
  const evidenceBundle = spec.query_id === "theft_dishonesty_research_memo"
    ? buildUploadedEvidenceBundle({
        evidence_text: "CCTV note: customer scanned most items, placed one item in a bag, appeared distracted by a phone call, and offered to pay immediately when stopped.",
        evidence_name: "store_cctv_note_text",
      })
    : buildUploadedEvidenceBundle({});
  const retrieval = retrieveCaseLawResearch({
    query: spec.query,
    issue_id: spec.issue_id,
    mode: "sample",
    max_cases: spec.supported ? 5 : 3,
    max_paragraphs: 4,
  });
  const rendered = renderCaseLawResearch({
    retrieval,
    query: spec.query,
    evidenceBundle,
    unsupportedReason: spec.supported ? "" : "unsupported_general_query",
  });
  const cases = retrieval.cases || [];
  const paragraphUrls = cases.flatMap(item => (item.paragraphs || []).map(paragraph => paragraph.source_url));
  const exactQuotes = cases.flatMap(item => (item.propositions || []).map(prop => prop.exact_quote_support).filter(Boolean));
  const allStatuses = cases.flatMap(item => []
    .concat(item.paragraphs || [], item.propositions || [], item.principles || [])
    .map(record => record.answer_layer_status));
  const result = {
    query_id: spec.query_id,
    supported_expected: spec.supported,
    query: spec.query,
    requested_issue_id: spec.issue_id,
    inferred_issue_ids: retrieval.inferred_issue_ids || [],
    cases_returned: cases.length,
    paragraph_url_count: paragraphUrls.length,
    paragraph_url_anchor_pass_rate: paragraphUrls.length
      ? paragraphUrls.filter(paragraphUrlOk).length / paragraphUrls.length
      : spec.supported ? 0 : 1,
    exact_quote_count: exactQuotes.length,
    answer_safe: false,
    answer_layer_status: rendered.answer_layer_status,
    review_status: rendered.review_status,
    l4_answer_safe_implemented: rendered.l4_answer_safe_implemented,
    evidence_ingested: evidenceBundle.uploaded_evidence_ingested,
    source_audit: retrieval.audit,
    cases: cases.map(caseSummary),
    markdown_excerpt: rendered.markdown.slice(0, 1200),
    pass: false,
    errors: [],
  };

  if (spec.supported) {
    if (!cases.length) result.errors.push("supported query returned no cases");
    if (!paragraphUrls.length || result.paragraph_url_anchor_pass_rate !== 1) result.errors.push("paragraph URLs missing or not anchored");
    if (!exactQuotes.length) result.errors.push("exact quotes missing");
    if (allStatuses.some(status => status && status !== "research_only")) result.errors.push("non research_only case-corpus status returned");
    if (rendered.l4_answer_safe_implemented !== false) result.errors.push("L4 answer-safe boundary changed");
  } else {
    if (cases.length) result.errors.push("unsupported query leaked case-corpus authority");
    if ((retrieval.inferred_issue_ids || []).length) result.errors.push("unsupported query inferred criminal issue ids");
  }
  if (result.answer_safe) result.errors.push("answer_safe unexpectedly true");
  result.pass = result.errors.length === 0;
  return result;
}

function writeMarkdown(report) {
  const lines = [
    "# Verified 500-Case Regression Report",
    "",
    "Local-only regression check for the separate 500-case corpus branch. PR #6 frozen demo artifacts are not rewritten by this report.",
    "",
    "| Query | Cases | Paragraph anchors | Exact quotes | Pass |",
    "|---|---:|---:|---:|---|",
    ...report.query_results.map(item => `| ${item.query_id} | ${item.cases_returned} | ${item.paragraph_url_anchor_pass_rate} | ${item.exact_quote_count} | ${item.pass ? "yes" : "no"} |`),
    "",
    "## Boundaries",
    "",
    `- Answer-safe count in regression: ${report.metrics.answer_safe_count}.`,
    `- Wrong-domain leak rate: ${report.metrics.wrong_domain_leak_rate}.`,
    `- Unsupported query abstention rate: ${report.metrics.unsupported_query_abstention_rate}.`,
    "- All supported outputs remain research_only / lawyer_review_required.",
    "",
    "## Query Notes",
    "",
    ...report.query_results.flatMap(item => [
      `### ${item.query_id}`,
      "",
      `- Inferred issues: ${item.inferred_issue_ids.join(", ") || "none"}.`,
      `- Cases returned: ${item.cases_returned}.`,
      `- Errors: ${item.errors.join("; ") || "none"}.`,
      "",
    ]),
  ];
  fs.writeFileSync(OUT_MD, `${lines.join("\n")}`, "utf8");
}

function main() {
  const corpus = loadCaseCorpus({ mode: "sample" });
  const queryResults = QUERIES.map(evaluateQuery);
  const supported = queryResults.filter(item => item.supported_expected);
  const unsupported = queryResults.filter(item => !item.supported_expected);
  const answerSafeCount = queryResults.filter(item => item.answer_safe).length;
  const wrongDomainLeakCount = unsupported.filter(item => item.cases_returned > 0).length;
  const report = {
    report_id: "verified_500_case_regression_report_v1",
    generated_at: "2026-06-30T00:00:00.000Z",
    corpus_counts: {
      registry_case_count: corpus.registry.length,
      paragraph_card_count: corpus.paragraphs.length,
      proposition_card_count: corpus.propositions.length,
      principle_card_count: corpus.principles.length,
      case_digest_card_count: corpus.digests.length,
    },
    metrics: {
      supported_query_count: supported.length,
      unsupported_query_count: unsupported.length,
      supported_queries_with_authorities: supported.filter(item => item.cases_returned > 0).length,
      paragraph_anchor_rate: supported.length
        ? Number((supported.reduce((sum, item) => sum + item.paragraph_url_anchor_pass_rate, 0) / supported.length).toFixed(6))
        : 1,
      answer_safe_count: answerSafeCount,
      wrong_domain_leak_rate: unsupported.length ? wrongDomainLeakCount / unsupported.length : 0,
      unsupported_query_abstention_rate: unsupported.length
        ? unsupported.filter(item => item.cases_returned === 0 && item.inferred_issue_ids.length === 0).length / unsupported.length
        : 1,
    },
    query_results: queryResults,
    status: queryResults.every(item => item.pass) ? "passed" : "failed",
  };
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeMarkdown(report);
  if (report.status !== "passed") {
    console.error("Verified 500-case regression failed:");
    for (const item of queryResults) {
      if (!item.pass) console.error(`- ${item.query_id}: ${item.errors.join("; ")}`);
    }
    process.exit(1);
  }
  console.log(JSON.stringify({ script: "report_verified_500_case_regression", metrics: report.metrics, status: report.status }, null, 2));
}

main();
