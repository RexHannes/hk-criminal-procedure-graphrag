const PUBLIC_AUTHORITY_URL_RE = /(?:hklii\.hk|legalref\.judiciary\.(?:hk|gov\.hk)|judiciary\.hk)/i;
const PARAGRAPH_ANCHOR_RE = /#p\d+/i;

function sourceUrlForAuthority(item = {}) {
  return String(item.source_url || item.official_url || item.url || "").trim();
}

function paragraphNumberForAuthority(item = {}) {
  return String(item.para_no || item.paragraph_number || item.paragraph_no || "").trim();
}

function quoteForAuthority(item = {}) {
  return String(item.exact_quote || item.supporting_quote || item.verified_text_excerpt || "").trim();
}

function paragraphTextForAuthority(item = {}) {
  return String(item.paragraph_text || item.text || item.verified_paragraph_text || "").trim();
}

function hasPublicAuthorityUrl(item = {}) {
  return PUBLIC_AUTHORITY_URL_RE.test(sourceUrlForAuthority(item));
}

function hasParagraphAnchor(item = {}) {
  return PARAGRAPH_ANCHOR_RE.test(sourceUrlForAuthority(item));
}

function hasExactQuoteSupport(item = {}) {
  const quote = quoteForAuthority(item);
  const paragraphText = paragraphTextForAuthority(item);
  return Boolean(quote && paragraphText && paragraphText.includes(quote));
}

function hasVerifiedPublicParagraphAuthority(item = {}) {
  return Boolean(
    hasPublicAuthorityUrl(item) &&
    hasParagraphAnchor(item) &&
    paragraphNumberForAuthority(item) &&
    hasExactQuoteSupport(item)
  );
}

function principleSummaryForAuthority(item = {}) {
  return String(
    item.principle_text ||
    item.proposition_text ||
    item.application_summary ||
    item.summary ||
    ""
  ).trim();
}

function normalizeAuthorityForReport(item = {}) {
  return {
    authority_id: item.authority_id || item.evidence_id || "",
    case_name: item.case_name || item.title_en || "",
    citation: item.neutral_citation || item.citation || item.law_report_citation || "",
    paragraph_number: paragraphNumberForAuthority(item),
    source_url: sourceUrlForAuthority(item),
    exact_quote: quoteForAuthority(item),
    principle_summary: principleSummaryForAuthority(item),
    issue_tags: item.issue_tags || [],
    doctrine_node_ids: item.doctrine_node_ids || [],
    answer_mode: item.answer_mode || "research_prototype",
    lawyer_review_status: item.lawyer_review_status || "unreviewed",
    professional_advice_certified: item.professional_advice_certified === true,
    verified_public_paragraph_authority: hasVerifiedPublicParagraphAuthority(item),
  };
}

function extractAuthorityItemsFromSearchPayload(payload = {}) {
  const fromMatches = (payload.matched_doctrine_nodes || []).flatMap(match =>
    (match.evidence || []).map(item => ({
      ...item,
      doctrine_node_id: item.doctrine_node_id || match.doctrine_node_id,
    }))
  );
  const fromAnalysis = (payload.inquiry_analysis?.case_references || []).map(item => ({
    ...item,
    doctrine_node_id: item.doctrine_node_id || "",
  }));
  return { fromMatches, fromAnalysis, all: [...fromMatches, ...fromAnalysis] };
}

module.exports = {
  PUBLIC_AUTHORITY_URL_RE,
  PARAGRAPH_ANCHOR_RE,
  sourceUrlForAuthority,
  paragraphNumberForAuthority,
  quoteForAuthority,
  paragraphTextForAuthority,
  hasPublicAuthorityUrl,
  hasParagraphAnchor,
  hasExactQuoteSupport,
  hasVerifiedPublicParagraphAuthority,
  principleSummaryForAuthority,
  normalizeAuthorityForReport,
  extractAuthorityItemsFromSearchPayload,
};
