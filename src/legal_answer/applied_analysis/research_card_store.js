const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const APPLIED_DIR = path.join(ROOT, "data", "legal_ingest", "applied_answer");
const SOURCE_CARDS_PATH = path.join(APPLIED_DIR, "source_cards", "part1_two_vertical_public_source_cards.json");
const PRINCIPLE_CARDS_PATH = path.join(APPLIED_DIR, "principle_cards", "part1_two_vertical_principle_cards.json");
const CASE_DIGEST_CARDS_PATH = path.join(APPLIED_DIR, "case_digest_cards", "part1_two_vertical_case_digest_cards.json");

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function byId(items, idField) {
  return new Map((items || []).map(item => [item[idField], item]));
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function loadResearchCards() {
  const sourcePayload = readJson(SOURCE_CARDS_PATH, { source_cards: [] });
  const principlePayload = readJson(PRINCIPLE_CARDS_PATH, { principle_cards: [] });
  const digestPayload = readJson(CASE_DIGEST_CARDS_PATH, { case_digest_cards: [] });
  return {
    source_cards: sourcePayload.source_cards || [],
    principle_cards: principlePayload.principle_cards || [],
    case_digest_cards: digestPayload.case_digest_cards || [],
    sourceById: byId(sourcePayload.source_cards || [], "source_card_id"),
    principleById: byId(principlePayload.principle_cards || [], "principle_id"),
    caseDigestById: byId(digestPayload.case_digest_cards || [], "case_digest_card_id"),
  };
}

function pickCards(ids, map) {
  return (ids || []).map(id => map.get(id)).filter(Boolean);
}

function sourceCardStatus(card) {
  if (!card) return "missing_source_card";
  if (card.checksum !== sha256(card.verified_text_excerpt || "")) return "checksum_mismatch";
  if (String(card.answer_layer_status || "").includes("answer_safe")) return "unsafe_answer_safe_source_card";
  return card.verification_status || "unknown";
}

module.exports = {
  CASE_DIGEST_CARDS_PATH,
  PRINCIPLE_CARDS_PATH,
  SOURCE_CARDS_PATH,
  loadResearchCards,
  pickCards,
  sha256,
  sourceCardStatus,
};
