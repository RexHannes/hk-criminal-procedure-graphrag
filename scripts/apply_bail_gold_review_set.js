#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const BATCH_DIR = path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "bail_public_batch_v1");
const PROPOSITIONS_PATH = path.join(BATCH_DIR, "proposition_cards.json");
const REVIEW_PACKET_PATH = path.join(BATCH_DIR, "answer_safe_review_packet.json");

const GOLD_IDS = [
  "prop_lai_2021_nsl_art42_text_p52",
  "prop_lai_2021_nsl_more_stringent_threshold_p53",
  "prop_lai_2021_nsl_exception_matrix_p54",
];

function parseArgs(argv) {
  const args = {
    confirm: false,
    reviewer: "",
    note: "",
  };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--confirm-human-reviewed") args.confirm = true;
    else if (argv[i] === "--reviewer") args.reviewer = argv[++i] || "";
    else if (argv[i] === "--note") args.note = argv[++i] || "";
  }
  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function validateCandidate(candidate, card) {
  const errors = [];
  if (!candidate) errors.push("missing_review_packet_candidate");
  if (!card) errors.push("missing_proposition_card");
  if (errors.length) return errors;
  if (candidate.authority_role === "party_argument" || card.authority_role === "party_argument") {
    errors.push("party_argument_cannot_be_answer_safe");
  }
  if (!candidate.citation) errors.push("citation_required");
  if (!candidate.paragraph_no) errors.push("paragraph_no_required");
  if (!candidate.exact_quote) errors.push("exact_quote_required");
  if (!candidate.paragraph_text || !candidate.paragraph_text.includes(candidate.exact_quote)) {
    errors.push("exact_quote_not_found_in_review_packet_paragraph");
  }
  if (card.exact_quote && card.exact_quote !== candidate.exact_quote) {
    errors.push("proposition_card_quote_mismatch");
  }
  if (!Array.isArray(candidate.target_doctrine_node_ids) || candidate.target_doctrine_node_ids.length === 0) {
    errors.push("target_doctrine_node_ids_required");
  }
  return errors;
}

function main() {
  const args = parseArgs(process.argv);
  const propositionsFile = readJson(PROPOSITIONS_PATH);
  const reviewPacket = readJson(REVIEW_PACKET_PATH);
  const cards = propositionsFile.proposition_cards || [];
  const candidates = reviewPacket.candidates || [];
  const report = {
    script_id: "apply_bail_gold_review_set_v1",
    confirmed: args.confirm,
    reviewer_present: Boolean(args.reviewer),
    note_present: Boolean(args.note),
    target_ids: GOLD_IDS,
    validations: [],
    wrote_files: false,
    policy: "This script does not decide legal correctness. It only records an explicit human/legal review confirmation.",
  };

  for (const id of GOLD_IDS) {
    const candidate = candidates.find(item => item.proposition_id === id);
    const card = cards.find(item => item.proposition_id === id);
    const errors = validateCandidate(candidate, card);
    report.validations.push({
      proposition_id: id,
      ok: errors.length === 0,
      errors,
      citation: candidate?.citation,
      paragraph_no: candidate?.paragraph_no,
      exact_quote: candidate?.exact_quote,
      source_url: candidate?.source_url,
    });
  }

  const failed = report.validations.filter(item => !item.ok);
  if (failed.length) {
    console.error(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  if (!args.confirm) {
    console.log(JSON.stringify({
      ...report,
      next_step: "Re-run with --confirm-human-reviewed --reviewer <name> --note <review-note> only after a human/legal reviewer has checked the packet.",
    }, null, 2));
    return;
  }
  if (!args.reviewer || !args.note) {
    console.error(JSON.stringify({
      ...report,
      error: "confirmed_promotion_requires_reviewer_and_note",
    }, null, 2));
    process.exit(1);
  }

  const reviewedAt = new Date().toISOString();
  for (const id of GOLD_IDS) {
    const candidate = candidates.find(item => item.proposition_id === id);
    const cardIndex = cards.findIndex(item => item.proposition_id === id);
    cards[cardIndex] = {
      ...cards[cardIndex],
      citation: candidate.citation,
      pinpoint: `para ${candidate.paragraph_no}`,
      paragraph: candidate.paragraph_no,
      supporting_quote: candidate.exact_quote,
      exact_quote: candidate.exact_quote,
      source_url: candidate.source_url || cards[cardIndex].source_url,
      verification_status: "source_verified",
      review_state: "answer_safe",
      answer_layer_status: "answer_safe",
      review_status: "approved",
      answer_safe: true,
      human_review_required: false,
      reviewed_by: args.reviewer,
      reviewed_at: reviewedAt,
      review_note: args.note,
      promotion_audit: [
        ...(cards[cardIndex].promotion_audit || []),
        {
          previous_status: cards[cardIndex].review_state || cards[cardIndex].answer_layer_status || "machine_candidate",
          new_status: "answer_safe",
          reviewed_by: args.reviewer,
          reviewed_at: reviewedAt,
          review_note: args.note,
          source: "answer_safe_review_packet",
        },
      ],
    };
    const packetIndex = candidates.findIndex(item => item.proposition_id === id);
    candidates[packetIndex] = {
      ...candidates[packetIndex],
      current_review_state: "answer_safe",
      current_answer_safe: true,
      reviewed_by: args.reviewer,
      reviewed_at: reviewedAt,
      review_note: args.note,
    };
  }

  propositionsFile.proposition_cards = cards;
  reviewPacket.candidates = candidates;
  writeJson(PROPOSITIONS_PATH, propositionsFile);
  writeJson(REVIEW_PACKET_PATH, reviewPacket);
  console.log(JSON.stringify({
    ...report,
    wrote_files: true,
    reviewed_at: reviewedAt,
    promoted_count: GOLD_IDS.length,
  }, null, 2));
}

main();
