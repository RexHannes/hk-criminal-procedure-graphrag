#!/usr/bin/env node
/* Report legal-model training dataset quality and coverage. */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SFT_DIR = path.join(ROOT, "data", "legal_model_training", "sft");
const ARTIFACT_JSON = path.join(ROOT, "artifacts", "legal_model_training_dataset_report.json");
const ARTIFACT_MD = path.join(ROOT, "artifacts", "legal_model_training_dataset_report.md");
const GENERATED_AT = "2026-06-30T00:00:00.000Z";

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, "utf8").trim();
  if (!text) return [];
  return text.split(/\n+/).filter(Boolean).map(JSON.parse);
}

function inc(object, key, amount = 1) {
  object[key] = (object[key] || 0) + amount;
}

function allDatasetRows() {
  if (!fs.existsSync(SFT_DIR)) return [];
  return fs.readdirSync(SFT_DIR)
    .filter(name => name.endsWith(".jsonl"))
    .flatMap(file => readJsonl(path.join(SFT_DIR, file)).map(row => ({ ...row, __file: file })));
}

function hasPrivateSource(row) {
  return /\b(lexis|westlaw|private_source|licensed_source|client_document|case_recall_only|source_candidate)\b/i.test(JSON.stringify(row));
}

function hasParagraphProof(row) {
  if (row.task === "retrieved_authorities_to_memo" && row.input?.expected_abstention === true) return true;
  return (row.paragraph_ids || []).length > 0 && (row.source_urls || []).some(url => /#p\d+$/i.test(url));
}

function hasQuoteSupport(row) {
  if (row.task === "retrieved_authorities_to_memo") return true;
  return String(row.exact_quote_support || "").trim().length >= 8;
}

function markdownTable(rows, headers) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map(row => `| ${headers.map(header => row[header] ?? "").join(" | ")} |`),
  ].join("\n");
}

const rows = allDatasetRows();
const byTask = {};
const splitCounts = {};
const issueCoverage = {};
let positiveUsablePrinciples = 0;
let demotedNegativeExamples = 0;
let answerSafeCount = 0;
let privateSourceCount = 0;
let unverifiedTeacherCount = 0;
let unsupportedDomainExamples = 0;
let sourceProofRequired = 0;
let sourceProofPassed = 0;
let quoteSupportRequired = 0;
let quoteSupportPassed = 0;

for (const row of rows) {
  inc(byTask, row.task || "unknown");
  inc(splitCounts, row.split || "unknown");
  for (const issue of row.issue_tags || []) inc(issueCoverage, issue);
  if (row.task === "proposition_to_principle" && row.usable_in_answer_layer === true) positiveUsablePrinciples += 1;
  if (row.task === "demotion_classifier" && row.output?.principle_quality_status === "demoted") demotedNegativeExamples += 1;
  if (row.answer_safe === true) answerSafeCount += 1;
  if (hasPrivateSource(row)) privateSourceCount += 1;
  if (row.provenance?.teacher_candidate === true && row.provenance?.verification_status !== "teacher_verified_quote_backed") unverifiedTeacherCount += 1;
  if (row.task === "retrieved_authorities_to_memo" && row.input?.expected_abstention === true) unsupportedDomainExamples += 1;
  sourceProofRequired += 1;
  if (hasParagraphProof(row)) sourceProofPassed += 1;
  if (row.task !== "retrieved_authorities_to_memo") {
    quoteSupportRequired += 1;
    if (hasQuoteSupport(row)) quoteSupportPassed += 1;
  }
}

const report = {
  report_id: "legal_model_training_dataset_report_v1",
  generated_at: GENERATED_AT,
  total_examples: rows.length,
  examples_by_task: byTask,
  train_eval_split_counts: splitCounts,
  positive_usable_principle_examples: positiveUsablePrinciples,
  demoted_negative_examples: demotedNegativeExamples,
  issue_coverage: issueCoverage,
  source_proof_rate: sourceProofRequired ? sourceProofPassed / sourceProofRequired : 1,
  quote_support_rate: quoteSupportRequired ? quoteSupportPassed / quoteSupportRequired : 1,
  answer_safe_count: answerSafeCount,
  private_source_count: privateSourceCount,
  unverified_teacher_count: unverifiedTeacherCount,
  unsupported_domain_examples: unsupportedDomainExamples,
  dataset_limitations: [
    "Dataset is derived from the frozen PR #6 120-case criminal-law sample only.",
    "No model has been trained in this PR.",
    "Teacher candidates remain candidate-only unless verified by public paragraph quote/card generation.",
    "The dataset teaches extraction, classification, demotion and memo drafting behaviour, not final legal advice.",
    "Current treatment and lawyer-reviewed answer-safe status remain out of scope.",
  ],
  recommended_minimum_corpus_size_before_lora: {
    verified_cases: 500,
    verified_task_examples: 5000,
    source_proof_rate: 1,
    quote_support_rate: 1,
    answer_safe_count: 0,
    private_source_count: 0,
  },
};

fs.mkdirSync(path.dirname(ARTIFACT_JSON), { recursive: true });
fs.writeFileSync(ARTIFACT_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");

const taskRows = Object.entries(byTask).map(([Task, Count]) => ({ Task, Count }));
const issueRows = Object.entries(issueCoverage).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([Issue, Count]) => ({ Issue: `\`${Issue}\``, Count }));
const md = [
  "# Legal Model Training Dataset Report",
  "",
  `Generated: ${GENERATED_AT}`,
  "",
  "## Summary",
  "",
  `- Total examples: ${report.total_examples}`,
  `- Source proof rate: ${report.source_proof_rate}`,
  `- Quote support rate: ${report.quote_support_rate}`,
  `- Answer-safe examples: ${report.answer_safe_count}`,
  `- Private/source-candidate examples: ${report.private_source_count}`,
  `- Unverified teacher examples in SFT: ${report.unverified_teacher_count}`,
  `- Unsupported-domain abstention examples: ${report.unsupported_domain_examples}`,
  "",
  "## Examples By Task",
  "",
  markdownTable(taskRows, ["Task", "Count"]),
  "",
  "## Split Counts",
  "",
  markdownTable(Object.entries(splitCounts).map(([Split, Count]) => ({ Split, Count })), ["Split", "Count"]),
  "",
  "## Top Issue Coverage",
  "",
  markdownTable(issueRows, ["Issue", "Count"]),
  "",
  "## Limitations",
  "",
  ...report.dataset_limitations.map(item => `- ${item}`),
  "",
  "## Recommended Minimum Before LoRA",
  "",
  "- 500 verified public cases",
  "- 5,000 verified task examples",
  "- source proof rate = 1",
  "- quote support rate = 1",
  "- answer_safe_count = 0",
  "- private_source_count = 0",
  "",
].join("\n");
fs.writeFileSync(ARTIFACT_MD, md, "utf8");

console.log(JSON.stringify({
  script: "report_legal_model_training_dataset",
  total_examples: report.total_examples,
  source_proof_rate: report.source_proof_rate,
  quote_support_rate: report.quote_support_rate,
  status: "passed",
}, null, 2));
