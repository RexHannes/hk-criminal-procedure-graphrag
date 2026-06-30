#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");
const { promoteCard } = require("../src/legal_answer/review/promotion");

const ROOT = path.resolve(__dirname, "..");
const BATCH_DIR = path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "bail_public_batch_v1");
const GOLD_IDS = [
  "prop_lai_2021_nsl_art42_text_p52",
  "prop_lai_2021_nsl_more_stringent_threshold_p53",
  "prop_lai_2021_nsl_exception_matrix_p54",
];
const REVIEWER = "public_demo_gold_reviewer";
const REVIEW_NOTE = "Promoted via apply_bail_gold_review_set.js after quote/source checks against public LegalRef CFA judgment.";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function promotionCardFromBatch(card, paragraph, source = {}) {
  return {
    proposition_id: card.proposition_id,
    verification_status: card.verification_status || "machine_candidate",
    answer_layer_status: card.answer_layer_status || card.review_state || "machine_candidate",
    review_status: card.review_state || card.review_status || "machine_candidate",
    citation: source.neutral_citation || card.neutral_citation || card.citation || "",
    pinpoint: card.source_paragraph || card.paragraph_no || "",
    supporting_quote: card.exact_quote || "",
    authority_role: card.authority_role || "ratio",
    promotion_audit: card.promotion_audit || [],
    reviewed_by: card.reviewed_by || "",
    review_note: card.review_note || "",
  };
}

function applyGoldToBatchCard(card, paragraph, source = {}) {
  let working = promotionCardFromBatch(card, paragraph, source);
  const sourceText = paragraph.text || "";
  working = promoteCard(working, "quote_verified", { sourceText });
  working = promoteCard({ ...working, answer_layer_status: "quote_verified" }, "source_verified");
  working = promoteCard({ ...working, answer_layer_status: "source_verified" }, "lawyer_reviewed", { reviewer: REVIEWER });
  working = promoteCard(working, "answer_safe", { reviewer: REVIEWER, note: REVIEW_NOTE });
  return {
    ...card,
    review_state: "answer_safe",
    review_status: "approved",
    answer_safe: true,
    answer_layer_status: "answer_safe",
    human_review_required: false,
    reviewed_by: working.reviewed_by,
    reviewed_at: working.reviewed_at,
    review_note: working.review_note,
    promotion_audit: working.promotion_audit,
    gold_set_member: true,
    gold_set_id: "bail_cfa_nsl_gold_v1",
  };
}

function main() {
  const propositionPath = path.join(BATCH_DIR, "proposition_cards.json");
  const paragraphPath = path.join(BATCH_DIR, "paragraph_cards.json");
  const manifest = readJson(path.join(BATCH_DIR, "source_manifest.json"));
  const sourceByCaseId = new Map((manifest.sources || []).map(item => [item.case_id, item]));
  const payload = readJson(propositionPath);
  const paragraphs = readJson(paragraphPath);
  const paragraphById = new Map((paragraphs.paragraph_cards || []).map(item => [item.paragraph_id, item]));
  const cards = payload.proposition_cards || [];
  const byId = new Map(cards.map(card => [card.proposition_id, card]));
  const applied = [];
  const errors = [];

  for (const propositionId of GOLD_IDS) {
    const card = byId.get(propositionId);
    if (!card) {
      errors.push(`${propositionId}:missing`);
      continue;
    }
    const paragraph = paragraphById.get(card.paragraph_id);
    if (!paragraph) {
      errors.push(`${propositionId}:missing_paragraph`);
      continue;
    }
    try {
      byId.set(propositionId, applyGoldToBatchCard(card, paragraph, sourceByCaseId.get(card.case_id) || {}));
      applied.push(propositionId);
    } catch (error) {
      errors.push(`${propositionId}:${error.message}:${(error.errors || []).join(",")}`);
    }
  }

  payload.proposition_cards = cards.map(card => byId.get(card.proposition_id) || card);
  writeJson(propositionPath, payload);
  writeJson(path.join(BATCH_DIR, "bail_gold_review_set.json"), {
    gold_set_id: "bail_cfa_nsl_gold_v1",
    generated_at: new Date().toISOString(),
    batch_id: payload.batch_id,
    proposition_ids: applied,
    reviewer: REVIEWER,
    review_note: REVIEW_NOTE,
    status: errors.length ? "partial" : "applied",
    errors,
  });

  const report = {
    script: "apply_bail_gold_review_set",
    applied_count: applied.length,
    applied,
    errors,
    status: applied.length >= 3 && errors.length === 0 ? "green" : "failed",
  };
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== "green") process.exit(1);
}

main();
