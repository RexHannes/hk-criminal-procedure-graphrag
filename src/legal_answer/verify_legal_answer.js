const { verificationResult } = require("./schema");

const PRIVATE_SOURCE_KINDS = new Set(["textbook_private", "precedent_private"]);

function sourceLocationPresent(source = {}) {
  return Boolean(
    source.neutral_citation ||
    source.law_report_citation ||
    source.cap ||
    source.section ||
    source.rule ||
    source.practice_direction_no ||
    source.paragraph ||
    source.page ||
    source.url_or_path
  );
}

function knownCitationStrings(sources = []) {
  const known = new Set();
  for (const source of sources) {
    [
      source.neutral_citation,
      source.law_report_citation,
      source.cap,
      source.section,
      source.practice_direction_no,
      source.title,
    ].filter(Boolean).forEach(value => known.add(String(value)));
  }
  return known;
}

function findCitationLikeStrings(text) {
  const patterns = [
    /\[[12][0-9]{3}\]\s+HK[A-Z]+\s+[0-9]+/g,
    /Cap\.?\s*[0-9][0-9A-Z]*/gi,
    /PD\s*[0-9]+(?:\.[0-9]+)?/gi,
  ];
  return patterns.flatMap(pattern => String(text || "").match(pattern) || []);
}

function verifyLegalAnswer(answer, evidencePack, { publicDemoMode = true } = {}) {
  const errors = [];
  const warnings = [];
  const unsupported = [];
  const chunks = new Map((evidencePack?.evidence_chunks || []).map(chunk => [chunk.excerpt_id, chunk]));
  const sources = new Map((answer?.sources_used || []).map(source => [source.source_id, source]));

  if (!answer?.retrieval_trace?.query) errors.push("retrieval trace missing query");
  if (!answer?.retrieval_trace?.collection_name) errors.push("retrieval trace missing collection name");
  if (!Number.isFinite(answer?.retrieval_trace?.top_k)) errors.push("retrieval trace missing top_k");
  if (!Number.isFinite(answer?.retrieval_trace?.returned_count)) errors.push("retrieval trace missing returned_count");
  if (!Array.isArray(answer?.retrieval_trace?.scores)) errors.push("retrieval trace missing scores");

  for (const source of answer?.sources_used || []) {
    if (!source.source_id) errors.push("source missing source_id");
    if (!source.chunk_id) errors.push(`source ${source.source_id || "unknown"} missing chunk_id`);
    if (!sourceLocationPresent(source)) warnings.push(`source ${source.source_id || "unknown"} missing citation/location`);
    if (publicDemoMode && PRIVATE_SOURCE_KINDS.has(source.source_kind)) {
      errors.push(`private/licensed source used in public-demo mode: ${source.source_id}`);
    }
  }

  for (const claim of answer?.legal_claims || []) {
    if (!claim.supporting_citations || !claim.supporting_citations.length) {
      errors.push(`claim ${claim.claim_id || claim.claim_text} missing supporting citation`);
      unsupported.push(claim.claim_id || claim.claim_text);
    }
    if (!claim.supporting_excerpt_ids || !claim.supporting_excerpt_ids.length) {
      errors.push(`claim ${claim.claim_id || claim.claim_text} missing supporting excerpt id`);
      unsupported.push(claim.claim_id || claim.claim_text);
    }
    for (const excerptId of claim.supporting_excerpt_ids || []) {
      if (!chunks.has(excerptId)) {
        errors.push(`claim ${claim.claim_id || claim.claim_text} cites missing excerpt ${excerptId}`);
        unsupported.push(claim.claim_id || claim.claim_text);
      }
    }
    for (const citation of claim.supporting_citations || []) {
      if (!citation.source_id || !sources.has(citation.source_id)) {
        errors.push(`claim ${claim.claim_id || claim.claim_text} cites missing source ${citation.source_id || "unknown"}`);
        unsupported.push(claim.claim_id || claim.claim_text);
      }
      if (!citation.chunk_id) errors.push(`claim ${claim.claim_id || claim.claim_text} citation missing chunk_id`);
    }
  }

  const known = knownCitationStrings(answer?.sources_used || []);
  const answerText = JSON.stringify({
    answer_summary: answer?.answer_summary,
    legal_claims: answer?.legal_claims,
    cannot_verify: answer?.cannot_verify,
  });
  const invented = findCitationLikeStrings(answerText).filter(item => !known.has(item));
  if (invented.length) {
    invented.forEach(item => errors.push(`invented citation-like string not present in sources: ${item}`));
  }

  if ((answer?.cannot_verify || []).length === 0 && (answer?.legal_claims || []).some(claim => claim.confidence === "unverified")) {
    warnings.push("unverified claims present but cannot_verify is empty");
  }

  return verificationResult({
    status: errors.length ? "failed" : "passed",
    errors: Array.from(new Set(errors)),
    warnings: Array.from(new Set(warnings)),
    unsupported_claim_ids: Array.from(new Set(unsupported)),
    invented_citation_warnings: Array.from(new Set(invented)),
  });
}

module.exports = {
  findCitationLikeStrings,
  sourceLocationPresent,
  verifyLegalAnswer,
};
