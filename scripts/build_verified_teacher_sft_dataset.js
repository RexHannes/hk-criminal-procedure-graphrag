#!/usr/bin/env node
/* Build SFT rows from teacher candidates only after public paragraph/card verification. */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DRY_RUN = process.argv.includes("--dry-run");
const TEACHER_DIR = path.join(ROOT, "data", "legal_model_training", "teacher_candidates");
const SFT_DIR = path.join(ROOT, "data", "legal_model_training", "sft");
const VERIFIED_INPUT = path.join(TEACHER_DIR, "verified_teacher_candidates.jsonl");
const TRAIN_OUT = path.join(SFT_DIR, "teacher_verified_extraction_train.jsonl");
const EVAL_OUT = path.join(SFT_DIR, "teacher_verified_extraction_eval.jsonl");

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, "utf8").trim();
  if (!text) return [];
  return text.split(/\n+/).filter(Boolean).map(JSON.parse);
}

function writeJsonl(filePath, rows) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, rows.map(row => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""), "utf8");
}

function countJsonl(filePath) {
  if (!fs.existsSync(filePath)) return 0;
  const text = fs.readFileSync(filePath, "utf8").trim();
  return text ? text.split(/\n+/).filter(Boolean).length : 0;
}

function admissible(record) {
  return Boolean(
    record &&
    record.teacher_tool &&
    record.verification_status === "teacher_verified_quote_backed" &&
    (record.source_paragraph_ids || []).length &&
    String(record.exact_quote_support || "").length >= 8 &&
    (record.generated_card_ids || []).length &&
    record.answer_safe === false
  );
}

const verifiedRecords = readJsonl(VERIFIED_INPUT);
const accepted = verifiedRecords.filter(admissible).map((record, index) => ({
  example_id: `teacher_verified_${record.candidate_id || index}`,
  task: "teacher_verified_extraction",
  split: index % 5 === 0 ? "eval" : "train",
  source_object_ids: record.generated_card_ids || [],
  case_id: record.case_id || "",
  case_name: record.case_name || "",
  citation: record.citation || "",
  court: record.court || "",
  judgment_date: record.judgment_date || "",
  paragraph_ids: record.source_paragraph_ids || [],
  source_urls: record.source_urls || [],
  exact_quote_support: record.exact_quote_support || "",
  issue_tags: record.issue_tags || [],
  answer_layer_status: "research_only",
  review_status: record.review_status || "machine_candidate",
  usable_in_answer_layer: record.usable_in_answer_layer === true,
  demotion_reasons: record.demotion_reasons || [],
  answer_safe: false,
  input: {
    teacher_tool: record.teacher_tool,
    teacher_model: record.teacher_model || "",
    verified_quote: record.exact_quote_support || "",
  },
  output: {
    generated_card_ids: record.generated_card_ids || [],
    proposition_text: record.proposition_text || "",
    principle_text: record.principle_text || "",
    demotion_reasons: record.demotion_reasons || [],
  },
  provenance: {
    source: "teacher_candidate_after_public_quote_verification",
    teacher_candidate: true,
    teacher_tool: record.teacher_tool,
    teacher_model: record.teacher_model || "",
    verification_status: record.verification_status,
    source_paragraph_ids: record.source_paragraph_ids || [],
    exact_quote_support: record.exact_quote_support || "",
    generated_card_ids: record.generated_card_ids || [],
  },
}));

const train = accepted.filter(row => row.split === "train");
const evalRows = accepted.filter(row => row.split === "eval");

if (!DRY_RUN) {
  writeJsonl(TRAIN_OUT, train);
  writeJsonl(EVAL_OUT, evalRows);
}

const staleOutputs = [];
if (DRY_RUN) {
  const committedTrain = countJsonl(TRAIN_OUT);
  const committedEval = countJsonl(EVAL_OUT);
  if (committedTrain !== train.length) {
    staleOutputs.push({ file: path.relative(ROOT, TRAIN_OUT), expected: train.length, committed: committedTrain });
  }
  if (committedEval !== evalRows.length) {
    staleOutputs.push({ file: path.relative(ROOT, EVAL_OUT), expected: evalRows.length, committed: committedEval });
  }
}

console.log(JSON.stringify({
  script: "build_verified_teacher_sft_dataset",
  dry_run: DRY_RUN,
  verified_input_exists: fs.existsSync(VERIFIED_INPUT),
  verified_records_seen: verifiedRecords.length,
  accepted_verified_records: accepted.length,
  train_count: train.length,
  eval_count: evalRows.length,
  stale_outputs: staleOutputs,
  status: staleOutputs.length ? "failed" : "passed",
}, null, 2));
if (staleOutputs.length) process.exit(1);
