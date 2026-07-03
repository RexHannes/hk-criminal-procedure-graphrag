#!/usr/bin/env node
/* Convert teacher candidates into a quote/paragraph verification queue. */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DRY_RUN = process.argv.includes("--dry-run");
const INPUT = path.join(ROOT, "data", "legal_model_training", "teacher_candidates", "sample_teacher_candidates.jsonl");
const OUTPUT = path.join(ROOT, "data", "legal_model_training", "teacher_candidates", "verification_queue.jsonl");

function readJsonl(filePath) {
  const text = fs.readFileSync(filePath, "utf8").trim();
  if (!text) return [];
  return text.split(/\n+/).filter(Boolean).map(JSON.parse);
}

function writeJsonl(filePath, rows) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, rows.map(row => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""), "utf8");
}

const candidates = readJsonl(INPUT);
const rows = candidates.map(candidate => ({
  queue_id: `verify_${candidate.candidate_id}`,
  candidate_id: candidate.candidate_id,
  source_url: candidate.source_url,
  case_name: candidate.case_name,
  citation: candidate.citation,
  paragraph_requests: (candidate.candidate_paragraph_numbers || []).map((paraNo, index) => ({
    para_no: String(paraNo),
    candidate_quote: (candidate.candidate_quotes || [])[index] || "",
    source_url_with_anchor: `${candidate.source_url.replace(/\/+$/, "")}#p${String(paraNo).replace(/^p/i, "")}`,
  })),
  proposed_issue_tags: candidate.candidate_issue_tags || [],
  proposed_outputs: {
    propositions: candidate.candidate_propositions || [],
    principles: candidate.candidate_principles || [],
    digest: candidate.candidate_digest || {},
    demotion_prediction: candidate.candidate_demotion_prediction || {},
  },
  authority_status: "candidate_only",
  answer_layer_status: "not_admissible_until_verified",
  verification_status: "pending_public_paragraph_quote_verification",
  sft_admission_status: "blocked_until_verified_cards_exist",
}));

if (!DRY_RUN) writeJsonl(OUTPUT, rows);
console.log(JSON.stringify({
  script: "convert_teacher_candidates_to_verification_queue",
  dry_run: DRY_RUN,
  input_count: candidates.length,
  output_count: rows.length,
  output: path.relative(ROOT, OUTPUT),
  status: "passed",
}, null, 2));
