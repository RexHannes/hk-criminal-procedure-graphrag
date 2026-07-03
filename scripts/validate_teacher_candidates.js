#!/usr/bin/env node
/* Validate teacher-candidate records and ensure they are not admitted to SFT unverified. */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CANDIDATE_PATH = process.argv.find(arg => arg.endsWith(".jsonl")) || path.join(ROOT, "data", "legal_model_training", "teacher_candidates", "sample_teacher_candidates.jsonl");
const SFT_DIR = path.join(ROOT, "data", "legal_model_training", "sft");
const errors = [];

function fail(message) {
  errors.push(message);
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, "utf8").trim();
  if (!text) return [];
  return text.split(/\n+/).filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      fail(`${filePath}:${index + 1} invalid JSON: ${error.message}`);
      return null;
    }
  }).filter(Boolean);
}

function blockedText(value) {
  return /\b(final legal advice|answer[-_ ]?safe\s*[:=]\s*true|lexis|westlaw|licensed database|private source|client document)\b/i.test(JSON.stringify(value));
}

function publicSourceUrl(url = "") {
  return /^https:\/\/(www\.)?(hklii|legalref|judiciary)\./i.test(url);
}

function validateCandidate(candidate) {
  const prefix = candidate.candidate_id || "(missing candidate_id)";
  for (const field of [
    "candidate_id",
    "teacher_tool",
    "teacher_model",
    "case_name",
    "citation",
    "source_url",
    "candidate_issue_tags",
    "candidate_paragraph_numbers",
    "candidate_quotes",
    "candidate_propositions",
    "candidate_principles",
    "candidate_digest",
    "candidate_demotion_prediction",
    "authority_status",
    "answer_layer_status",
    "answer_safe",
  ]) {
    if (candidate[field] === undefined || candidate[field] === null || candidate[field] === "") {
      fail(`${prefix} missing ${field}`);
    }
  }
  if (!["DeepSeek", "NotebookLM", "Claude", "GPT", "manual_analysis"].includes(candidate.teacher_tool)) {
    fail(`${prefix} has unsupported teacher_tool ${candidate.teacher_tool}`);
  }
  if (!publicSourceUrl(candidate.source_url)) fail(`${prefix} lacks public HKLII/LegalRef/Judiciary source URL`);
  if (!(candidate.candidate_paragraph_numbers || []).length) fail(`${prefix} lacks paragraph reference`);
  if (!(candidate.candidate_quotes || []).length) fail(`${prefix} lacks candidate quote`);
  if (candidate.authority_status !== "candidate_only") fail(`${prefix} must remain authority_status=candidate_only`);
  if (candidate.answer_layer_status !== "not_admissible_until_verified") fail(`${prefix} must remain not_admissible_until_verified`);
  if (candidate.answer_safe !== false) fail(`${prefix} must not mark itself answer_safe`);
  if (blockedText(candidate)) fail(`${prefix} contains final-advice/private/licensed/source-leak wording`);
}

function validateNotInSft(candidates) {
  if (!fs.existsSync(SFT_DIR)) return;
  const candidateIds = new Set(candidates.map(candidate => candidate.candidate_id));
  for (const file of fs.readdirSync(SFT_DIR).filter(name => name.endsWith(".jsonl"))) {
    for (const row of readJsonl(path.join(SFT_DIR, file))) {
      const blob = JSON.stringify(row);
      for (const id of candidateIds) {
        if (blob.includes(id) && row.provenance?.verification_status !== "teacher_verified_quote_backed") {
          fail(`${id} appears in ${file} without teacher_verified_quote_backed provenance`);
        }
      }
      if (row.authority_status === "candidate_only" || row.answer_layer_status === "not_admissible_until_verified") {
        fail(`${file} contains direct teacher-candidate authority: ${row.example_id || "(missing example_id)"}`);
      }
    }
  }
}

const candidates = readJsonl(CANDIDATE_PATH);
if (!candidates.length) fail(`no teacher candidates found at ${CANDIDATE_PATH}`);
for (const candidate of candidates) validateCandidate(candidate);
validateNotInSft(candidates);

if (errors.length) {
  console.error("Teacher candidate validation failed:");
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log(JSON.stringify({
  validator: "validate_teacher_candidates",
  candidate_count: candidates.length,
  status: "passed",
}, null, 2));
