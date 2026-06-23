#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const BATCH_DIR = path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "bail_public_batch_v1");
const OUT = path.join(BATCH_DIR, "answer_safe_review_packet.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

const manifest = readJson(path.join(BATCH_DIR, "source_manifest.json"));
const paragraphPayload = readJson(path.join(BATCH_DIR, "paragraph_cards.json"));
const propositionPayload = readJson(path.join(BATCH_DIR, "proposition_cards.json"));
const paragraphById = new Map((paragraphPayload.paragraph_cards || []).map(item => [item.paragraph_id, item]));
const sourceByCaseId = new Map((manifest.sources || []).map(item => [item.case_id, item]));

const preferredIds = [
  "prop_lai_2021_nsl_art42_text_p52",
  "prop_lai_2021_nsl_more_stringent_threshold_p53",
  "prop_lai_2021_nsl_exception_matrix_p54",
  "prop_lai_2021_bail_conditions_relevant_p57",
  "prop_lai_2021_bail_conditions_deterrent_p58",
  "prop_lai_2021_nsl_summary_p70",
  "prop_lai_2021_tong_limited_p72",
];

const propositions = propositionPayload.proposition_cards || [];
const byId = new Map(propositions.map(item => [item.proposition_id, item]));
const candidates = preferredIds
  .map(id => byId.get(id))
  .filter(Boolean)
  .map(card => {
    const paragraph = paragraphById.get(card.paragraph_id) || {};
    const source = sourceByCaseId.get(card.case_id) || {};
    return {
      proposition_id: card.proposition_id,
      case_id: card.case_id,
      case_name: source.case_name || "",
      citation: source.neutral_citation || "",
      court_level: source.court_level || "",
      paragraph_id: card.paragraph_id,
      paragraph_no: card.source_paragraph,
      proposition_text: card.proposition_text,
      exact_quote: card.exact_quote,
      paragraph_text: paragraph.text || "",
      authority_role: card.authority_role,
      target_doctrine_node_ids: card.target_doctrine_node_ids || [],
      current_review_state: card.review_state || "machine_candidate",
      current_answer_safe: card.answer_safe === true,
      source_url: source.source_url_or_path || card.source_url || "",
      required_human_checks: [
        "Confirm the exact quote appears in the public judgment paragraph.",
        "Confirm the proposition is a fair legal summary of the paragraph.",
        "Confirm authority_role is correct and not merely party submission/factual background.",
        "Confirm later treatment/lineage notes do not undermine the proposition.",
        "Confirm the linked doctrine node IDs are appropriate.",
      ],
    };
  });

const packet = {
  packet_id: "bail_answer_safe_review_packet_v1",
  generated_at: new Date().toISOString(),
  batch_id: manifest.batch_id,
  purpose: "Human/legal review packet for promoting the first bail gold-set propositions. This file does not approve or promote anything by itself.",
  review_policy: {
    auto_promotion_allowed: false,
    required_status_before_answer_safe: "lawyer_reviewed",
    minimum_gold_set_for_20k_gate: 3,
    suggested_order: "Start with CFA ratio propositions before CFI application propositions.",
  },
  candidates,
  suggested_review_api: {
    endpoint: "POST /api/legal-ingest/review/<proposition_id>/approve",
    auth: "Authorization: Bearer $LEGAL_REVIEW_ADMIN_TOKEN",
    body: {
      promote_answer_safe: true,
      reviewed_by: "lawyer_reviewer",
      note: "Human-reviewed against public judgment paragraph and approved for answer-safe pilot use.",
    },
  },
};

writeJson(OUT, packet);
console.log(`Bail answer-safe review packet written: ${path.relative(ROOT, OUT)} (${candidates.length} candidates)`);
