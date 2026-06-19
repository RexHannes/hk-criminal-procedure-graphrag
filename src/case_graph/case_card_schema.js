const crypto = require("crypto");

const CASE_INGESTION_STATUSES = new Set([
  "machine_candidate",
  "paragraphized",
  "proposition_extracted",
  "tree_attached",
  "reviewed",
  "rejected",
]);

function cleanString(value) {
  return String(value || "").trim();
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function caseCard(input = {}) {
  return {
    case_id: cleanString(input.case_id),
    case_name: cleanString(input.case_name),
    neutral_citation: cleanString(input.neutral_citation),
    law_report_citation: cleanString(input.law_report_citation),
    court: cleanString(input.court),
    date: cleanString(input.date),
    judges: Array.isArray(input.judges) ? input.judges.map(cleanString).filter(Boolean) : [],
    source_url_or_path: cleanString(input.source_url_or_path),
    source_visibility: cleanString(input.source_visibility || "public_demo"),
    tenant_id: cleanString(input.tenant_id || "public"),
    source_kind: cleanString(input.source_kind || "case"),
    licence_status: cleanString(input.licence_status || "public_or_demo_safe"),
    ingestion_status: CASE_INGESTION_STATUSES.has(input.ingestion_status) ? input.ingestion_status : "machine_candidate",
    fixture_status: cleanString(input.fixture_status),
    authority_status: cleanString(input.authority_status),
  };
}

function paragraphCard(input = {}) {
  const caseId = cleanString(input.case_id);
  const paragraphNo = cleanString(input.paragraph_no);
  const text = cleanString(input.text);
  return {
    paragraph_id: cleanString(input.paragraph_id || `${caseId}_p${paragraphNo}`),
    case_id: caseId,
    paragraph_no: paragraphNo,
    text,
    chunk_hash: cleanString(input.chunk_hash || sha256(`${caseId}:${paragraphNo}:${text}`)),
    source_visibility: cleanString(input.source_visibility || "public_demo"),
    tenant_id: cleanString(input.tenant_id || "public"),
    fixture_status: cleanString(input.fixture_status),
    authority_status: cleanString(input.authority_status),
  };
}

function validateCaseCard(card = {}) {
  const errors = [];
  for (const field of ["case_id", "case_name", "source_visibility", "tenant_id", "source_kind", "licence_status", "ingestion_status"]) {
    if (!card[field]) errors.push(`case_card_missing_${field}`);
  }
  if (card.source_visibility !== "public_demo") errors.push("case_card_must_be_public_demo");
  if (card.tenant_id !== "public") errors.push("case_card_must_use_public_tenant");
  if (["licensed_private", "firm_private", "private"].includes(card.source_visibility)) errors.push("private_case_not_allowed_in_public_case_graph");
  if (!CASE_INGESTION_STATUSES.has(card.ingestion_status)) errors.push(`invalid_ingestion_status:${card.ingestion_status}`);
  return errors;
}

function validateParagraphCard(card = {}) {
  const errors = [];
  for (const field of ["paragraph_id", "case_id", "paragraph_no", "text", "chunk_hash", "source_visibility", "tenant_id"]) {
    if (!card[field]) errors.push(`paragraph_card_missing_${field}`);
  }
  if (card.source_visibility !== "public_demo") errors.push("paragraph_card_must_be_public_demo");
  if (card.tenant_id !== "public") errors.push("paragraph_card_must_use_public_tenant");
  if (!/^[0-9a-f]{64}$/.test(card.chunk_hash || "")) errors.push("paragraph_card_invalid_chunk_hash");
  return errors;
}

module.exports = {
  CASE_INGESTION_STATUSES,
  caseCard,
  paragraphCard,
  sha256,
  validateCaseCard,
  validateParagraphCard,
};
