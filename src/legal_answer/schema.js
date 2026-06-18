const SOURCE_KINDS = new Set([
  "case",
  "ordinance",
  "subsidiary_legislation",
  "practice_direction",
  "textbook_private",
  "proposition_card",
  "precedent_private",
  "form_metadata",
  "other",
]);

const CLAIM_TYPES = new Set([
  "principle",
  "procedure",
  "evidence",
  "pleading",
  "warning",
  "cannot_verify",
]);

const CONFIDENCE = new Set(["high", "medium", "low", "unverified"]);

function nowIso() {
  return new Date().toISOString();
}

function cleanString(value) {
  return String(value || "").trim();
}

function legalSource(input = {}) {
  const sourceKind = SOURCE_KINDS.has(input.source_kind) ? input.source_kind : "other";
  return {
    source_id: cleanString(input.source_id),
    source_kind: sourceKind,
    source_visibility: cleanString(input.source_visibility || "public_demo"),
    tenant_id: cleanString(input.tenant_id || "public"),
    title: cleanString(input.title),
    jurisdiction: cleanString(input.jurisdiction || "HK"),
    court: cleanString(input.court),
    case_name: cleanString(input.case_name),
    neutral_citation: cleanString(input.neutral_citation),
    law_report_citation: cleanString(input.law_report_citation),
    cap: cleanString(input.cap),
    section: cleanString(input.section),
    rule: cleanString(input.rule),
    practice_direction_no: cleanString(input.practice_direction_no),
    paragraph: cleanString(input.paragraph),
    page: cleanString(input.page),
    url_or_path: cleanString(input.url_or_path),
    effective_date: cleanString(input.effective_date),
    retrieved_at: cleanString(input.retrieved_at || nowIso()),
    chunk_id: cleanString(input.chunk_id),
    chunk_hash: cleanString(input.chunk_hash),
    retrieval_score: Number(input.retrieval_score || 0),
    retrieval_stage: cleanString(input.retrieval_stage || "manual_fixture"),
  };
}

function evidenceChunk(input = {}) {
  const source = legalSource(input.source || input);
  return {
    excerpt_id: cleanString(input.excerpt_id || input.chunk_id || source.chunk_id),
    source_id: source.source_id,
    chunk_id: source.chunk_id,
    chunk_hash: source.chunk_hash,
    excerpt: cleanString(input.excerpt),
    normalized_excerpt: cleanString(input.normalized_excerpt || input.excerpt).toLowerCase(),
    source,
    issue_tags: Array.isArray(input.issue_tags) ? input.issue_tags.map(cleanString).filter(Boolean) : [],
    authority_role: cleanString(input.authority_role),
    answer_layer_status: cleanString(input.answer_layer_status || "research_only"),
    review_status: cleanString(input.review_status || "unreviewed"),
    warnings: Array.isArray(input.warnings) ? input.warnings.map(cleanString).filter(Boolean) : [],
  };
}

function legalCitation(input = {}) {
  return {
    citation_id: cleanString(input.citation_id || input.excerpt_id || input.chunk_id),
    source_id: cleanString(input.source_id),
    chunk_id: cleanString(input.chunk_id),
    source_kind: SOURCE_KINDS.has(input.source_kind) ? input.source_kind : "other",
    title: cleanString(input.title),
    neutral_citation: cleanString(input.neutral_citation),
    law_report_citation: cleanString(input.law_report_citation),
    cap: cleanString(input.cap),
    section: cleanString(input.section),
    paragraph: cleanString(input.paragraph),
    page: cleanString(input.page),
    pinpoint: cleanString(input.pinpoint),
    url_or_path: cleanString(input.url_or_path),
  };
}

function legalClaim(input = {}) {
  return {
    claim_id: cleanString(input.claim_id),
    claim_text: cleanString(input.claim_text),
    claim_type: CLAIM_TYPES.has(input.claim_type) ? input.claim_type : "warning",
    supporting_citations: Array.isArray(input.supporting_citations) ? input.supporting_citations.map(legalCitation) : [],
    supporting_excerpt_ids: Array.isArray(input.supporting_excerpt_ids) ? input.supporting_excerpt_ids.map(cleanString).filter(Boolean) : [],
    confidence: CONFIDENCE.has(input.confidence) ? input.confidence : "unverified",
    basis: cleanString(input.basis),
    human_review_required: input.human_review_required !== false,
  };
}

function retrievalTrace(input = {}) {
  return {
    query: cleanString(input.query),
    collection_name: cleanString(input.collection_name),
    top_k: Number(input.top_k || 0),
    returned_count: Number(input.returned_count || 0),
    retrieval_mode: cleanString(input.retrieval_mode || "qdrant"),
    scores: Array.isArray(input.scores) ? input.scores.map(Number) : [],
    stages: Array.isArray(input.stages) ? input.stages.map(cleanString).filter(Boolean) : [],
    warnings: Array.isArray(input.warnings) ? input.warnings.map(cleanString).filter(Boolean) : [],
  };
}

function verificationResult(input = {}) {
  return {
    status: cleanString(input.status || "unchecked"),
    checked_at: cleanString(input.checked_at || nowIso()),
    errors: Array.isArray(input.errors) ? input.errors.map(cleanString).filter(Boolean) : [],
    warnings: Array.isArray(input.warnings) ? input.warnings.map(cleanString).filter(Boolean) : [],
    unsupported_claim_ids: Array.isArray(input.unsupported_claim_ids) ? input.unsupported_claim_ids.map(cleanString).filter(Boolean) : [],
    invented_citation_warnings: Array.isArray(input.invented_citation_warnings) ? input.invented_citation_warnings.map(cleanString).filter(Boolean) : [],
  };
}

function legalAnswer(input = {}) {
  return {
    answer_summary: cleanString(input.answer_summary),
    legal_claims: Array.isArray(input.legal_claims) ? input.legal_claims.map(legalClaim) : [],
    sources_used: Array.isArray(input.sources_used) ? input.sources_used.map(legalSource) : [],
    retrieval_trace: retrievalTrace(input.retrieval_trace || {}),
    warnings: Array.isArray(input.warnings) ? input.warnings.map(cleanString).filter(Boolean) : [],
    cannot_verify: Array.isArray(input.cannot_verify) ? input.cannot_verify.map(cleanString).filter(Boolean) : [],
    verification: input.verification ? verificationResult(input.verification) : undefined,
  };
}

module.exports = {
  CLAIM_TYPES,
  CONFIDENCE,
  SOURCE_KINDS,
  evidenceChunk,
  legalAnswer,
  legalCitation,
  legalClaim,
  legalSource,
  retrievalTrace,
  verificationResult,
};
