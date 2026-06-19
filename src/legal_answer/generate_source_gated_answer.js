const { legalAnswer, legalCitation, legalClaim } = require("./schema");

const QUERY_STOPWORDS = new Set([
  "about",
  "after",
  "also",
  "and",
  "answer",
  "are",
  "case",
  "cases",
  "can",
  "claim",
  "consequence",
  "court",
  "does",
  "explain",
  "for",
  "from",
  "give",
  "have",
  "hong",
  "how",
  "into",
  "kong",
  "law",
  "legal",
  "more",
  "principle",
  "principles",
  "procedure",
  "proceeding",
  "proceedings",
  "rule",
  "rules",
  "should",
  "test",
  "that",
  "the",
  "their",
  "there",
  "this",
  "what",
  "when",
  "where",
  "with",
]);

function citationFromChunk(chunk) {
  const source = chunk.source || {};
  return legalCitation({
    citation_id: chunk.excerpt_id,
    source_id: source.source_id,
    chunk_id: chunk.chunk_id,
    source_kind: source.source_kind,
    title: source.title,
    neutral_citation: source.neutral_citation,
    law_report_citation: source.law_report_citation,
    cap: source.cap,
    section: source.section,
    paragraph: source.paragraph,
    page: source.page,
    pinpoint: source.paragraph || source.page || source.section,
    url_or_path: source.url_or_path,
  });
}

function tokenize(value) {
  return String(value || "")
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/)
    .filter(token => token.length >= 4 && !QUERY_STOPWORDS.has(token));
}

function evidenceText(chunks) {
  return chunks.map(chunk => [
    chunk.excerpt,
    chunk.authority_role,
    chunk.review_status,
    chunk.answer_layer_status,
    ...(chunk.issue_tags || []),
    chunk.source?.title,
    chunk.source?.neutral_citation,
    chunk.source?.law_report_citation,
    chunk.source?.cap,
    chunk.source?.section,
  ].filter(Boolean).join(" ")).join(" ").toLowerCase();
}

function evidenceOnPoint(query, chunks) {
  if (!chunks.length) {
    return { on_point: false, overlap_terms: [], query_terms: [] };
  }
  const queryTerms = Array.from(new Set(tokenize(query)));
  if (!queryTerms.length) {
    return { on_point: true, overlap_terms: [], query_terms: [] };
  }
  const evidenceTerms = new Set(tokenize(evidenceText(chunks)));
  const overlap = queryTerms.filter(term => evidenceTerms.has(term));
  const highSignalQuery = /\b(bail|arrest|charge|plea|theft|dishonest|dishonesty|search warrant|warrant|sentenc|criminal|magistrat)\b/i.test(query || "");
  const onPoint = overlap.length > 0 && (!highSignalQuery || overlap.some(term => !["criminal"].includes(term)));
  return {
    on_point: onPoint,
    overlap_terms: overlap,
    query_terms: queryTerms,
  };
}

function claimTypeForChunk(chunk) {
  if (chunk.source?.source_kind === "form_metadata") return "procedure";
  const tags = (chunk.issue_tags || []).join(" ").toLowerCase();
  if (/pleading|inconsistent|abuse|estoppel|henderson|alternative/.test(tags)) return "principle";
  return "evidence";
}

function confidenceForChunk(chunk) {
  if (chunk.answer_layer_status === "answer_safe") return "high";
  if (["quote_verified", "source_verified", "verified"].includes(chunk.review_status)) return "medium";
  if (chunk.excerpt && chunk.source?.neutral_citation) return "medium";
  return "low";
}

function basisForChunk(chunk) {
  if (chunk.source?.source_kind === "proposition_card") return "proposition-card based, research-only unless reviewed";
  if (chunk.source?.source_kind === "precedent_private") return "precedent-based, not legal authority";
  if (chunk.source?.source_kind === "textbook_private") return "private textbook/commentary, not primary authority";
  return "retrieved source excerpt";
}

function reviewStateForChunk(chunk) {
  if (chunk.answer_layer_status === "answer_safe") return "answer_safe";
  if (chunk.answer_layer_status === "lawyer_reviewed") return "lawyer_reviewed";
  if (chunk.review_status === "approved") return "lawyer_reviewed";
  if (chunk.review_status === "source_verified" || chunk.answer_layer_status === "source_verified") return "source_verified";
  if (chunk.review_status === "quote_verified" || chunk.answer_layer_status === "quote_verified" || chunk.authority_role === "applied_principle") return "quote_verified";
  return "machine_candidate";
}

function claimTextForChunk(chunk) {
  const source = chunk.source || {};
  const citation = [source.neutral_citation, source.paragraph].filter(Boolean).join(" ");
  if (chunk.source?.source_kind === "form_metadata") {
    return `${source.title || "A candidate document/form"} may be relevant as a document or workflow candidate, but it is not legal authority.`;
  }
  const excerpt = chunk.excerpt || source.title || "Retrieved evidence";
  return `${excerpt}${citation ? ` (${citation})` : ""}`;
}

function generateSourceGatedAnswer(evidencePack) {
  const chunks = evidencePack?.evidence_chunks || [];
  const relevance = evidenceOnPoint(evidencePack?.query || "", chunks);
  const usableChunks = relevance.on_point ? chunks : [];
  const legalClaims = usableChunks.map((chunk, index) => legalClaim({
    review_state: reviewStateForChunk(chunk),
    answer_safe: reviewStateForChunk(chunk) === "answer_safe",
    claim_id: `claim_${index + 1}`,
    claim_text: claimTextForChunk(chunk),
    claim_type: claimTypeForChunk(chunk),
    supporting_citations: [citationFromChunk(chunk)],
    supporting_excerpt_ids: [chunk.excerpt_id],
    confidence: confidenceForChunk(chunk),
    basis: basisForChunk(chunk),
    human_review_required: reviewStateForChunk(chunk) !== "answer_safe",
  }));
  const cannotVerify = [];
  if (!chunks.length) {
    cannotVerify.push("No source card was retrieved from the current database.");
  } else if (!relevance.on_point) {
    cannotVerify.push("Retrieved source cards are not sufficiently on point for this query.");
  }
  const hasCollateral = JSON.stringify(chunks).toLowerCase().includes("collateral");
  const asksCollateral = /collateral attack/i.test(evidencePack?.query || "");
  if (asksCollateral && !hasCollateral) {
    cannotVerify.push("Collateral attack is not verified from the current retrieved evidence pack.");
  }
  const warnings = Array.from(new Set([
    ...(evidencePack?.warnings || []),
    "research_assistant_output_not_legal_advice",
    usableChunks.some(chunk => chunk.source?.source_kind === "proposition_card") ? "proposition_card_based_not_direct_authority" : "",
    chunks.length && !relevance.on_point ? "retrieved_evidence_not_on_point" : "",
  ].filter(Boolean)));
  const summary = usableChunks.length
    ? legalClaims.every(claim => claim.review_state === "machine_candidate")
      ? `Retrieved ${chunks.length} source-backed item(s). This is a machine-generated research draft, not reviewed.`
      : `Retrieved ${chunks.length} source-backed item(s). The answer below is extractive and source-gated; each legal claim cites retrieved evidence and exposes review state.`
    : "No verified answer can be given from the current database.";
  return legalAnswer({
    answer_summary: summary,
    legal_claims: legalClaims,
    sources_used: usableChunks.map(chunk => chunk.source),
    retrieval_trace: evidencePack.retrieval_trace,
    warnings,
    cannot_verify: cannotVerify,
  });
}

module.exports = {
  citationFromChunk,
  evidenceOnPoint,
  generateSourceGatedAnswer,
  reviewStateForChunk,
};
