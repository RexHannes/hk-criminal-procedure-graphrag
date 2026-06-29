#!/usr/bin/env node
/* Evaluate hybrid retrieval over the committed L1-L3.5 sample corpus. */

const fs = require("fs");
const path = require("path");
const {
  ROOT,
  PATHS,
  loadCaseCorpus,
} = require("../src/legal_answer/case_corpus/case_corpus_store");
const { retrieveHybridCaseCorpus } = require("../src/legal_answer/case_corpus/hybrid_case_retriever");
const { sourceProofIndexes, paragraphVerified } = require("../src/legal_answer/case_corpus/source_proof_filter");

const OUT_JSON = path.join(ROOT, "artifacts", "case_corpus_retrieval_eval.json");
const OUT_MD = path.join(ROOT, "artifacts", "case_corpus_retrieval_eval.md");

function avg(values = []) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function relevantCaseIds(corpus, issueIds = []) {
  const set = new Set();
  for (const item of corpus.issueMap) {
    if (issueIds.includes(item.issue_id)) set.add(item.case_id);
  }
  return set;
}

function reciprocalRank(returnedCaseIds = [], relevant = new Set()) {
  const index = returnedCaseIds.findIndex(id => relevant.has(id));
  return index >= 0 ? 1 / (index + 1) : 0;
}

function issueMatchRate(results = [], issueIds = []) {
  if (!results.length) return 0;
  return results.filter(item => (item.chunks || []).some(chunk => (chunk.issue_tags || []).some(tag => issueIds.includes(tag)))).length / results.length;
}

function paragraphQuoteSupportRate(retrieval, indexes) {
  const proofBearingChunks = []
    .concat(retrieval.top_paragraphs || [])
    .concat(retrieval.top_propositions || [])
    .concat(retrieval.top_principles || [])
    .concat(retrieval.top_digests || [])
    .filter(chunk => (chunk.paragraph_ids || []).length > 0);
  if (!proofBearingChunks.length) return retrieval.top_cases.length ? 0 : 1;
  return proofBearingChunks.filter(chunk => (chunk.paragraph_ids || []).some(id => paragraphVerified(indexes.paragraphById.get(id)))).length / proofBearingChunks.length;
}

function sourceProofRate(retrieval) {
  const total = (retrieval.top_paragraphs || []).length +
    (retrieval.top_propositions || []).length +
    (retrieval.top_principles || []).length +
    (retrieval.top_digests || []).length;
  if (!total) return retrieval.top_cases.length ? 0 : 1;
  const passed = []
    .concat(retrieval.top_paragraphs || [])
    .concat(retrieval.top_propositions || [])
    .concat(retrieval.top_principles || [])
    .concat(retrieval.top_digests || [])
    .filter(item => /^passed/.test(item.source_proof_status || "")).length;
  return passed / total;
}

function evaluateQuery(querySpec, corpus, indexes) {
  const retrieval = retrieveHybridCaseCorpus({
    query: querySpec.query,
    issue_id: querySpec.issue_id || "",
    mode: "sample",
    max_cases: 10,
    max_paragraphs: 12,
  });
  const returnedCaseIds = retrieval.top_cases.map(item => item.case_id);

  if (querySpec.negative) {
    const wrongDomainLeak = returnedCaseIds.length > 0 ? 1 : 0;
    return {
      query_id: querySpec.query_id,
      negative: true,
      returned_case_count: returnedCaseIds.length,
      recall_at_5: 1,
      recall_at_10: 1,
      precision_at_5: wrongDomainLeak ? 0 : 1,
      mrr: wrongDomainLeak ? 0 : 1,
      issue_match_rate: wrongDomainLeak ? 0 : 1,
      source_proof_rate: wrongDomainLeak ? 0 : 1,
      paragraph_quote_support_rate: wrongDomainLeak ? 0 : 1,
      wrong_domain_leak: wrongDomainLeak,
      unsupported_query_abstained: returnedCaseIds.length === 0,
      returned_case_ids: returnedCaseIds,
      excluded_results: retrieval.excluded_results,
    };
  }

  const relevant = relevantCaseIds(corpus, querySpec.expected_issue_ids || []);
  const top5 = returnedCaseIds.slice(0, 5);
  const top10 = returnedCaseIds.slice(0, 10);
  const hits5 = top5.filter(id => relevant.has(id)).length;
  const hits10 = top10.filter(id => relevant.has(id)).length;
  return {
    query_id: querySpec.query_id,
    negative: false,
    expected_issue_ids: querySpec.expected_issue_ids,
    relevant_case_count: relevant.size,
    returned_case_count: returnedCaseIds.length,
    recall_at_5: relevant.size ? hits5 / relevant.size : 1,
    recall_at_10: relevant.size ? hits10 / relevant.size : 1,
    precision_at_5: top5.length ? hits5 / top5.length : 0,
    mrr: reciprocalRank(returnedCaseIds, relevant),
    issue_match_rate: issueMatchRate(retrieval.top_cases, querySpec.expected_issue_ids || []),
    source_proof_rate: sourceProofRate(retrieval),
    paragraph_quote_support_rate: paragraphQuoteSupportRate(retrieval, indexes),
    wrong_domain_leak: 0,
    unsupported_query_abstained: false,
    returned_case_ids: returnedCaseIds,
    ranking_breakdown: retrieval.ranking_breakdown.slice(0, 5),
    excluded_results: retrieval.excluded_results,
  };
}

function writeMarkdown(report) {
  const lines = [
    "# Case Corpus Retrieval Evaluation",
    "",
    "Research-only L1-L3.5 retrieval evaluation over the 100-case sample corpus.",
    "",
    "| Metric | Value |",
    "|---|---:|",
    `| Recall@5 | ${report.metrics.recall_at_5} |`,
    `| Recall@10 | ${report.metrics.recall_at_10} |`,
    `| Precision@5 | ${report.metrics.precision_at_5} |`,
    `| MRR | ${report.metrics.mrr} |`,
    `| Issue match rate | ${report.metrics.issue_match_rate} |`,
    `| Source proof rate | ${report.metrics.source_proof_rate} |`,
    `| Paragraph quote support rate | ${report.metrics.paragraph_quote_support_rate} |`,
    `| Wrong-domain leak rate | ${report.metrics.wrong_domain_leak_rate} |`,
    `| Unsupported query abstention rate | ${report.metrics.unsupported_query_abstention_rate} |`,
    "",
    "## Query Results",
    "",
    "| Query | R@5 | R@10 | P@5 | MRR | Returned |",
    "|---|---:|---:|---:|---:|---:|",
    ...report.query_results.map(item => `| ${item.query_id} | ${item.recall_at_5} | ${item.recall_at_10} | ${item.precision_at_5} | ${item.mrr} | ${item.returned_case_count} |`),
    "",
    "## Boundary",
    "",
    "- All retrieved case-corpus results remain research_only / lawyer-review-required.",
    "- The unsupported landlord/rent query must abstain and must not receive theft authority.",
    "- Source proof is required before any case/proposition/principle can appear in the rendered research layer.",
    "",
  ];
  fs.writeFileSync(OUT_MD, `${lines.join("\n")}\n`, "utf8");
}

function main() {
  const suite = JSON.parse(fs.readFileSync(PATHS.retrievalEvalQueriesSample, "utf8"));
  const corpus = loadCaseCorpus({ mode: "sample" });
  const indexes = sourceProofIndexes(corpus);
  const queryResults = suite.queries.map(query => evaluateQuery(query, corpus, indexes));
  const positives = queryResults.filter(item => !item.negative);
  const negatives = queryResults.filter(item => item.negative);
  const metrics = {
    recall_at_5: Number(avg(positives.map(item => item.recall_at_5)).toFixed(6)),
    recall_at_10: Number(avg(positives.map(item => item.recall_at_10)).toFixed(6)),
    precision_at_5: Number(avg(positives.map(item => item.precision_at_5)).toFixed(6)),
    mrr: Number(avg(positives.map(item => item.mrr)).toFixed(6)),
    issue_match_rate: Number(avg(positives.map(item => item.issue_match_rate)).toFixed(6)),
    source_proof_rate: Number(avg(queryResults.map(item => item.source_proof_rate)).toFixed(6)),
    paragraph_quote_support_rate: Number(avg(queryResults.map(item => item.paragraph_quote_support_rate)).toFixed(6)),
    wrong_domain_leak_rate: Number(avg(queryResults.map(item => item.wrong_domain_leak)).toFixed(6)),
    unsupported_query_abstention_rate: Number(avg(negatives.map(item => item.unsupported_query_abstained ? 1 : 0)).toFixed(6)),
  };
  const report = {
    eval_suite_id: suite.eval_suite_id,
    generated_at: "2026-06-29T00:00:00.000Z",
    metrics,
    query_results: queryResults,
    acceptance: {
      wrong_domain_leak_rate_zero: metrics.wrong_domain_leak_rate === 0,
      unsupported_query_abstention_passed: metrics.unsupported_query_abstention_rate === 1,
      all_outputs_research_only: true,
      answer_safe: false,
    },
  };
  if (metrics.wrong_domain_leak_rate !== 0 || metrics.unsupported_query_abstention_rate !== 1) {
    console.error("Retrieval eval failed boundary checks.");
    console.error(JSON.stringify(report.metrics, null, 2));
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeMarkdown(report);
  console.log(JSON.stringify({ script: "evaluate_case_corpus_retrieval", metrics, status: "passed" }, null, 2));
}

main();
