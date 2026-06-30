#!/usr/bin/env node
/* Estimate PR #7 dataset-export readiness from this branch without modifying PR #7. */

const fs = require("fs");
const path = require("path");
const {
  ROOT,
  PATHS,
  readJsonl,
  byId,
} = require("../src/legal_answer/case_corpus/case_corpus_store");
const {
  sourceProofIndexes,
  propositionVerified,
  principleVerified,
} = require("../src/legal_answer/case_corpus/source_proof_filter");

const OUT_JSON = path.join(ROOT, "artifacts", "dataset_readiness_projection_500_case.json");
const OUT_MD = path.join(ROOT, "artifacts", "dataset_readiness_projection_500_case.md");

function countBy(records = [], keyFn) {
  const counts = {};
  for (const record of records) {
    const key = keyFn(record) || "unknown";
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function main() {
  const registry = readJsonl(PATHS.registrySample);
  const paragraphs = readJsonl(PATHS.paragraphsSample);
  const propositions = readJsonl(PATHS.propositionsSample);
  const principles = readJsonl(PATHS.principlesSample);
  const digests = readJsonl(PATHS.digestsSample);
  const issueMap = readJsonl(PATHS.issueMapSample);
  const corpus = { registry, paragraphs, propositions, principles, digests, issueMap };
  const indexes = sourceProofIndexes(corpus);
  const paragraphById = byId(paragraphs, "paragraph_id");

  const verifiedPropositions = propositions.filter(prop => propositionVerified(prop, indexes));
  const usablePrinciples = principles.filter(principle => principle.usable_in_answer_layer === true && principleVerified(principle, indexes));
  const demotedPrinciples = principles.filter(principle => principle.principle_quality_status === "demoted");
  const issueMappedRowsWithProof = issueMap.filter(item =>
    (item.paragraph_ids || []).some(id => paragraphById.has(id)) &&
    (item.proposition_ids || []).length
  );
  const digestRowsWithProof = digests.filter(digest => (digest.key_paragraphs || []).some(id => paragraphById.has(id)));
  const retrievalMemoSeeds = [
    "theft_dishonesty_research_memo",
    "intention_permanently_deprive",
    "belonging_to_another",
    "bail_theft_dishonesty",
    "unsupported_landlord_abstention",
  ];

  const projectedTasks = [
    {
      task_type: "paragraph_to_proposition",
      projected_rows: verifiedPropositions.length,
      basis: "One quote-verified proposition row per verified proposition card.",
    },
    {
      task_type: "proposition_to_principle",
      projected_rows: usablePrinciples.length,
      basis: "One usable research-only principle row per pass-quality principle.",
    },
    {
      task_type: "demotion_classifier",
      projected_rows: demotedPrinciples.length,
      basis: "One demotion classifier row per demoted principle card, preserving the demotion reason.",
    },
    {
      task_type: "issue_map_relevance",
      projected_rows: issueMappedRowsWithProof.length,
      basis: "One issue-to-case relevance row per issue map row with paragraph/proposition proof.",
    },
    {
      task_type: "case_digest_summarization",
      projected_rows: digestRowsWithProof.length,
      basis: "One digest summarization row per case digest with paragraph proof.",
    },
    {
      task_type: "retrieved_authorities_to_memo",
      projected_rows: retrievalMemoSeeds.length,
      basis: "Only the committed local demo/regression query patterns; no synthetic broad legal-advice prompts.",
    },
  ];
  const projectedTotalRows = projectedTasks.reduce((sum, item) => sum + item.projected_rows, 0);
  const report = {
    report_id: "dataset_readiness_projection_500_case_v1",
    generated_at: "2026-06-30T00:00:00.000Z",
    scope: "Projection only. This branch does not write PR #7 dataset files, run training, or promote answer-safe propositions.",
    corpus_counts: {
      registry_case_count: registry.length,
      paragraph_card_count: paragraphs.length,
      proposition_card_count: propositions.length,
      principle_card_count: principles.length,
      usable_principle_count: usablePrinciples.length,
      demoted_principle_count: demotedPrinciples.length,
      digest_card_count: digests.length,
      issue_map_count: issueMap.length,
    },
    projected_tasks: projectedTasks,
    projected_total_rows: projectedTotalRows,
    projected_thresholds: {
      min_1000_rows_met: projectedTotalRows >= 1000,
      min_5000_rows_met: projectedTotalRows >= 5000,
      recommended_before_training: [
        "Run the PR #7 exporter on its own branch after this PR is reviewed.",
        "Keep answer_safe=false and current_treatment_status=unchecked in exported examples.",
        "Deduplicate near-identical sentencing/background rows before training.",
        "Separate demotion/abstention examples from legal-memo examples.",
      ],
    },
    issue_distribution: countBy(issueMap, item => item.issue_id),
    forbidden_actions: [
      "No PR #7 files are modified by this projection.",
      "No model training is run.",
      "No private/licensed material is used.",
      "No answer_safe labels are produced.",
    ],
    status: projectedTotalRows >= 1000 ? "projection_ready_for_pr7_exporter_review" : "projection_too_small",
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(OUT_MD, `${[
    "# Dataset Readiness Projection For 500-Case Corpus",
    "",
    report.scope,
    "",
    "| Metric | Value |",
    "|---|---:|",
    `| Registry cases | ${registry.length} |`,
    `| Paragraph cards | ${paragraphs.length} |`,
    `| Proposition cards | ${propositions.length} |`,
    `| Usable principles | ${usablePrinciples.length} |`,
    `| Demoted principles | ${demotedPrinciples.length} |`,
    `| Projected dataset rows | ${projectedTotalRows} |`,
    `| 1k threshold met | ${report.projected_thresholds.min_1000_rows_met} |`,
    `| 5k threshold met | ${report.projected_thresholds.min_5000_rows_met} |`,
    "",
    "## Projected Tasks",
    "",
    "| Task | Rows | Basis |",
    "|---|---:|---|",
    ...projectedTasks.map(item => `| ${item.task_type} | ${item.projected_rows} | ${item.basis} |`),
    "",
    "## Boundary",
    "",
    ...report.forbidden_actions.map(item => `- ${item}`),
    "",
  ].join("\n")}`, "utf8");
  console.log(JSON.stringify({
    script: "report_dataset_readiness_projection_500_case",
    projected_total_rows: projectedTotalRows,
    min_5000_rows_met: report.projected_thresholds.min_5000_rows_met,
    status: report.status,
  }, null, 2));
}

main();
