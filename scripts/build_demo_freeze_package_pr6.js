#!/usr/bin/env node
/* Build the PR #6 boss/VC demo freeze package from committed reports. */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const GENERATED_AT = "2026-06-30T00:00:00.000Z";
const PR_NUMBER = 6;
const BRANCH = "codex/investor-recall-25k-path";
const FREEZE_BASELINE_HEAD = "f4e19a81fdd780eb7e685adc3f1a263a023dd935";

const SAFE_DEMO_CLAIM = "The system demonstrates a source-proofed, research-only HK criminal-law case-law assistant over a targeted 120-case L1-L3.5 sample. It retrieves public case authorities with paragraph anchors, extracted propositions/principles, issue mapping, demotion filtering, and answer-first research memos. It is not final legal advice and remains lawyer-review-required.";

const FORBIDDEN_CLAIMS = [
  "10k answer-safe propositions",
  "whole HK legal RAG solved",
  "production legal advice",
  "lawyer-reviewed current treatment",
  "automated OCR/PDF/image/audio/video evidence analysis",
];

const KNOWN_LIMITATIONS = [
  "The PR remains a draft research/demo preview, not a merged production release.",
  "The sample is intentionally frozen at 120 targeted criminal-law cases; this run does not scale to 500, 10k or 25k cases.",
  "All case-law outputs remain research_only and lawyer_review_required.",
  "No machine-generated proposition or principle is promoted to answer_safe.",
  "The three repaired target issues are medium coverage, not broad lawyer-reviewed coverage.",
  "Current treatment, ratio/obiter classification and final legal advice require later lawyer review.",
  "Uploaded evidence handling is text/transcript triage only; OCR/PDF/image/audio/video evidence analysis is not implemented.",
  "Private/licensed sources, AI candidates and recall-only cases cannot support answer-layer authority.",
];

const DEMO_QUERIES = [
  {
    id: "A",
    label: "Theft/dishonesty",
    query: "If I forgot to pay at a shop, what are the dishonesty issues?",
    expected_route: "demo_supported theft/shoplifting answer with case-corpus research attached",
    expected_product_modes: ["demo_supported", "source_grounded_research_only"],
    expected_issue_id: "criminal_law.theft.dishonesty",
    expected_source_proof_behaviour: "Return public case-law research only when paragraph anchors, proposition quote support and usable principle filtering pass.",
    case_corpus_should_be_used: true,
    should_abstain: false,
    expected_answer_safe: false,
    expected_needs_lawyer_review: true,
  },
  {
    id: "B",
    label: "Intention permanently to deprive",
    query: "What does intention permanently to deprive mean in theft?",
    expected_route: "source_grounded_research_only case-corpus memo",
    expected_product_modes: ["source_grounded_research_only"],
    expected_issue_id: "criminal_law.theft.intention_permanently_deprive",
    expected_source_proof_behaviour: "Return only paragraph-proofed public cases mapped to intention permanently to deprive or theft.",
    case_corpus_should_be_used: true,
    should_abstain: false,
    expected_answer_safe: false,
    expected_needs_lawyer_review: true,
  },
  {
    id: "C",
    label: "Belonging to another",
    query: "How does Hong Kong theft law handle property belonging to another?",
    expected_route: "source_grounded_research_only case-corpus memo",
    expected_product_modes: ["source_grounded_research_only"],
    expected_issue_id: "criminal_law.theft.belonging_to_another",
    expected_source_proof_behaviour: "Return only paragraph-proofed public cases mapped to belonging-to-another or theft.",
    case_corpus_should_be_used: true,
    should_abstain: false,
    expected_answer_safe: false,
    expected_needs_lawyer_review: true,
  },
  {
    id: "D",
    label: "Bail",
    query: "What bail factors matter in a theft or dishonesty-related case?",
    expected_route: "source_grounded_research_only case-corpus memo",
    expected_product_modes: ["source_grounded_research_only"],
    expected_issue_id: "criminal_procedure.bail",
    expected_source_proof_behaviour: "Return only paragraph-proofed public cases mapped to bail; do not convert bail/procedure material into liability advice.",
    case_corpus_should_be_used: true,
    should_abstain: false,
    expected_answer_safe: false,
    expected_needs_lawyer_review: true,
  },
  {
    id: "E",
    label: "Unsupported",
    query: "My landlord increased my rent. What should I do?",
    expected_route: "unsupported_general_query",
    expected_product_modes: ["unsupported_general_query"],
    expected_issue_id: "",
    expected_source_proof_behaviour: "Abstain from criminal-law case-corpus authority and do not cite theft/dishonesty cases.",
    case_corpus_should_be_used: false,
    should_abstain: true,
    expected_answer_safe: false,
    expected_needs_lawyer_review: true,
  },
];

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function writeText(relativePath, text) {
  const filePath = path.join(ROOT, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text.endsWith("\n") ? text : `${text}\n`, "utf8");
}

function coverageById(coverage) {
  const out = {};
  for (const item of coverage.coverage || []) out[item.issue_id] = item;
  return out;
}

function mdTable(rows, headers) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map(row => `| ${headers.map(header => row[header] ?? "").join(" | ")} |`),
  ].join("\n");
}

function buildReport() {
  const status = readJson("artifacts/case_corpus_l1_l35_status.json");
  const coverage = readJson("artifacts/case_corpus_issue_coverage.json");
  const retrieval = readJson("artifacts/case_corpus_retrieval_eval.json");
  const quality = readJson("artifacts/case_corpus_quality_audit.json");
  const repair = readJson("artifacts/principle_quality_repair_report.json");
  const weakDiscovery = readJson("artifacts/weak_issue_target_discovery_report.json");

  const corpusCounts = {
    registry_case_count: status.registry_case_count,
    paragraph_card_count: status.paragraph_card_count,
    proposition_card_count: status.proposition_card_count,
    principle_card_count: status.principle_card_count,
    case_digest_card_count: status.case_digest_card_count,
    usable_principle_count: status.usable_principle_count,
    demoted_principle_count: status.demoted_principle_count,
  };

  const retrievalMetrics = {
    precision_at_5: retrieval.metrics.precision_at_5,
    recall_at_10: retrieval.metrics.recall_at_10,
    legacy_corpus_recall_at_10: retrieval.metrics.legacy_corpus_recall_at_10,
    mrr: retrieval.metrics.mrr,
    issue_match_rate: retrieval.metrics.issue_match_rate,
    exact_lookup_hit_rate: retrieval.metrics.exact_lookup_hit_rate,
  };

  const sourceProofMetrics = {
    source_proof_rate: retrieval.metrics.source_proof_rate,
    paragraph_quote_support_rate: retrieval.metrics.paragraph_quote_support_rate,
    wrong_domain_leak_rate: retrieval.metrics.wrong_domain_leak_rate,
    unsupported_query_abstention_rate: retrieval.metrics.unsupported_query_abstention_rate,
    paragraph_match_rate: quality.summary.paragraph_match_rate,
    quote_support_match_rate: quality.summary.quote_support_match_rate,
  };

  const report = {
    report_id: "pr6_demo_freeze_report",
    generated_at: GENERATED_AT,
    pr: {
      number: PR_NUMBER,
      branch: BRANCH,
      freeze_baseline_head_commit: FREEZE_BASELINE_HEAD,
      final_head_commit_note: "The final pushed PR head is recorded in the PR body after commit/push; a committed artifact cannot embed its own eventual commit SHA.",
    },
    safe_demo_claim: SAFE_DEMO_CLAIM,
    forbidden_claims: FORBIDDEN_CLAIMS,
    corpus_counts: corpusCounts,
    principle_quality: {
      usable_principle_count: status.usable_principle_count,
      demoted_principle_count: status.demoted_principle_count,
      principle_quality_status_counts: status.principle_quality_status_counts,
      demotion_reason_counts: repair.summary.demotion_reason_counts,
      principle_quality_pass_rate: status.principle_quality_pass_rate,
      principle_quality_pass_rate_basis: status.principle_quality_pass_rate_basis,
    },
    issue_coverage: coverage.coverage,
    weak_issue_targets: weakDiscovery.targets.map(target => ({
      issue_id: target.issue_id,
      baseline_case_count: target.baseline_case_count,
      current_verified_case_count: target.after_case_count,
      target_min_cases: target.target_min_cases,
      target_met: target.target_met,
    })),
    retrieval_metrics: retrievalMetrics,
    source_proof_metrics: sourceProofMetrics,
    unsupported_query_abstention: retrieval.metrics.unsupported_query_abstention_rate,
    answer_safe_count: status.answer_safe_count,
    quality_audit: {
      audited_case_count: quality.summary.audited_case_count,
      proposition_quality_pass_rate: quality.summary.proposition_quality_pass_rate,
      principle_quality_pass_rate: quality.summary.principle_quality_pass_rate,
      principle_quality_pass_rate_basis: quality.summary.principle_quality_pass_rate_basis,
      quality_audit_pass_rate: quality.summary.quality_audit_pass_rate,
      suspicious_card_count: quality.summary.suspicious_cards.length,
      rejected_or_demoted_card_count: quality.summary.rejected_or_demoted_cards.length,
    },
    known_limitations: KNOWN_LIMITATIONS,
    artifact_paths: {
      boss_demo_script: "docs/boss_demo_script_pr6.md",
      demo_query_pack_json: "artifacts/demo_outputs/demo_query_pack.json",
      demo_query_pack_md: "artifacts/demo_outputs/demo_query_pack.md",
      readiness_validator: "scripts/validate_demo_readiness_pr6.js",
      smoke_test: "scripts/smoke_test_pr6_demo_api.js",
    },
  };

  writeText("artifacts/demo_freeze_report.json", JSON.stringify(report, null, 2));
  writeText("artifacts/demo_freeze_report.md", renderReportMarkdown(report));

  const queryPack = {
    pack_id: "pr6_demo_query_pack",
    generated_at: GENERATED_AT,
    pr_number: PR_NUMBER,
    branch: BRANCH,
    safe_demo_claim: SAFE_DEMO_CLAIM,
    queries: DEMO_QUERIES,
  };
  writeText("artifacts/demo_outputs/demo_query_pack.json", JSON.stringify(queryPack, null, 2));
  writeText("artifacts/demo_outputs/demo_query_pack.md", renderQueryPackMarkdown(queryPack));
  writeText("docs/boss_demo_script_pr6.md", renderBossDemoScript(report, queryPack));

  return report;
}

function renderReportMarkdown(report) {
  const coverageRows = report.issue_coverage.map(item => ({
    Issue: `\`${item.issue_id}\``,
    Cases: item.case_count,
    Coverage: item.coverage_band,
  }));
  const weakRows = report.weak_issue_targets.map(item => ({
    Issue: `\`${item.issue_id}\``,
    "Baseline": item.baseline_case_count,
    "Current": item.current_verified_case_count,
    Target: item.target_min_cases,
    Met: item.target_met ? "yes" : "no",
  }));
  return [
    "# PR #6 Demo Freeze Report",
    "",
    `Generated: ${report.generated_at}`,
    "",
    "## PR",
    "",
    `- PR number: ${report.pr.number}`,
    `- Branch: \`${report.pr.branch}\``,
    `- Freeze baseline head commit: \`${report.pr.freeze_baseline_head_commit}\``,
    `- Final head note: ${report.pr.final_head_commit_note}`,
    "",
    "## Safe Demo Claim",
    "",
    `> ${report.safe_demo_claim}`,
    "",
    "## Corpus Counts",
    "",
    mdTable([
      { Metric: "Cases", Value: report.corpus_counts.registry_case_count },
      { Metric: "Paragraph cards", Value: report.corpus_counts.paragraph_card_count },
      { Metric: "Proposition cards", Value: report.corpus_counts.proposition_card_count },
      { Metric: "Principle cards", Value: report.corpus_counts.principle_card_count },
      { Metric: "Digest cards", Value: report.corpus_counts.case_digest_card_count },
      { Metric: "Usable principles", Value: report.corpus_counts.usable_principle_count },
      { Metric: "Demoted principles preserved", Value: report.corpus_counts.demoted_principle_count },
      { Metric: "Answer-safe cards", Value: report.answer_safe_count },
    ], ["Metric", "Value"]),
    "",
    "## Issue Coverage",
    "",
    mdTable(coverageRows, ["Issue", "Cases", "Coverage"]),
    "",
    "## Repaired Weak Targets",
    "",
    mdTable(weakRows, ["Issue", "Baseline", "Current", "Target", "Met"]),
    "",
    "## Retrieval Metrics",
    "",
    mdTable(Object.entries(report.retrieval_metrics).map(([Metric, Value]) => ({ Metric, Value })), ["Metric", "Value"]),
    "",
    "## Source Proof Metrics",
    "",
    mdTable(Object.entries(report.source_proof_metrics).map(([Metric, Value]) => ({ Metric, Value })), ["Metric", "Value"]),
    "",
    "## Unsupported Query Abstention",
    "",
    `- Unsupported-query abstention rate: ${report.unsupported_query_abstention}`,
    "",
    "## Known Limitations",
    "",
    ...report.known_limitations.map(item => `- ${item}`),
    "",
    "## Forbidden Claims",
    "",
    ...report.forbidden_claims.map(item => `- ${item}`),
    "",
  ].join("\n");
}

function renderQueryPackMarkdown(pack) {
  const rows = pack.queries.map(query => ({
    ID: query.id,
    Query: query.query,
    Route: query.expected_route,
    Issue: query.expected_issue_id ? `\`${query.expected_issue_id}\`` : "none",
    Corpus: query.case_corpus_should_be_used ? "yes" : "no",
    Abstain: query.should_abstain ? "yes" : "no",
    "Answer Safe": String(query.expected_answer_safe),
  }));
  return [
    "# PR #6 Demo Query Pack",
    "",
    `Generated: ${pack.generated_at}`,
    "",
    "## Safe Demo Claim",
    "",
    `> ${pack.safe_demo_claim}`,
    "",
    "## Queries",
    "",
    mdTable(rows, ["ID", "Query", "Route", "Issue", "Corpus", "Abstain", "Answer Safe"]),
    "",
    "## Source-Proof Expectations",
    "",
    ...pack.queries.map(query => [
      `### ${query.id}. ${query.label}`,
      "",
      `- Expected source-proof behaviour: ${query.expected_source_proof_behaviour}`,
      `- Expected needs lawyer review: ${query.expected_needs_lawyer_review}`,
      "",
    ].join("\n")),
  ].join("\n");
}

function renderBossDemoScript(report, pack) {
  const supported = pack.queries.filter(query => !query.should_abstain).slice(0, 3);
  const unsupported = pack.queries.find(query => query.should_abstain);
  return [
    "# PR #6 Boss/VC Demo Script",
    "",
    "## Timing",
    "",
    "This is a 5-7 minute script for a boss or investor review. Keep the tone simple: this is a careful legal-research demo, not a finished legal-advice product.",
    "",
    "## One-Sentence Product Framing",
    "",
    "This is a source-proofed Hong Kong criminal-law research assistant that finds public case authorities, shows exact paragraph anchors, and refuses to turn weak or unsupported material into confident legal advice.",
    "",
    "## 0:00-0:45 - The Problem",
    "",
    "Legal AI often sounds confident even when it has not proved the source. For criminal law, that is dangerous: a factual background paragraph, a sentencing remark, or an unrelated case can be mistaken for a liability rule. This demo is built to show a safer path: every answer starts from public source proof and keeps a clear boundary between research and advice.",
    "",
    "## 0:45-1:45 - What The 120-Case Sample Proves",
    "",
    `The frozen sample has ${report.corpus_counts.registry_case_count} targeted public Hong Kong criminal-law cases, ${report.corpus_counts.paragraph_card_count} paragraph cards, ${report.corpus_counts.proposition_card_count} proposition cards, and ${report.corpus_counts.principle_card_count} principle cards. The important point is not the count alone. The important point is that weak material is filtered: ${report.corpus_counts.usable_principle_count} principles are currently usable for the research layer, while ${report.corpus_counts.demoted_principle_count} weaker principles are preserved for audit instead of being hidden or used as authority.`,
    "",
    "## 1:45-2:45 - Why Source Proof Matters",
    "",
    "When the system cites a case, it should show a public paragraph URL and an exact quote path. That gives a lawyer or reviewer something concrete to inspect. It also lets the product say no when the source is missing, private, candidate-only, recall-only, or outside the loaded issue map.",
    "",
    "## 2:45-3:30 - How Demoted Principles Prevent Hallucination",
    "",
    "The system now marks each extracted principle as pass, demoted, or needs review. Sentencing-only material should not become a theft liability rule. Factual background should not become a legal test. Demoted cards stay in the audit trail, but they are filtered out of answer-layer principle chunks and demo authority.",
    "",
    "## 3:30-5:15 - Supported Demo Queries",
    "",
    ...supported.flatMap(query => [
      `### ${query.id}. ${query.label}`,
      "",
      `Ask: \"${query.query}\"`,
      "",
      "Expected explanation: the answer should return a research memo, show case-by-case authorities, include paragraph URLs and exact quote support, and clearly say `answer_safe=false` with lawyer review required.",
      "",
    ]),
    "## 5:15-6:00 - Unsupported Query",
    "",
    `Ask: \"${unsupported.query}\"`,
    "",
    "Expected explanation: the system should abstain. It should not borrow theft or dishonesty cases for a landlord/rent question. This is a feature, not a failure: it shows wrong-domain leakage is being controlled.",
    "",
    "## 6:00-6:45 - How To Explain `answer_safe=false`",
    "",
    "`answer_safe=false` means the system is doing legal research triage, not final advice. It can show useful authorities and issue maps, but a lawyer still needs to verify current treatment, ratio/obiter status, the full judgment, and the user's actual evidence before relying on it.",
    "",
    "## Next Roadmap",
    "",
    "The next step is a separate 500-case scaling PR only after review gates remain green: no wrong-domain leakage, source proof stays at 1.0, unsupported queries abstain, and medium issue tags are strengthened. Do not present this PR as a whole-HK legal RAG or as production legal advice.",
    "",
    "## Safe Demo Claim",
    "",
    `> ${report.safe_demo_claim}`,
    "",
    "## Forbidden Claims",
    "",
    ...report.forbidden_claims.map(item => `- ${item}`),
    "",
  ].join("\n");
}

const report = buildReport();
console.log(`Wrote PR #${report.pr.number} demo freeze package.`);
