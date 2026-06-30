const crypto = require("crypto");
const {
  loadCaseCorpus,
  byId,
  normalizeParagraphText,
} = require("./case_corpus_store");
const { principleUsable } = require("./principle_quality");

const CHUNK_SCHEMA_VERSION = "case_corpus_chunk_v1";
const SAFE_MAX_PARAGRAPH_TOKENS = 1400;

function sha256(value = "") {
  return crypto.createHash("sha256").update(normalizeParagraphText(value), "utf8").digest("hex");
}

function tokenEstimate(text = "") {
  const normalized = normalizeParagraphText(text);
  if (!normalized) return 0;
  return Math.max(1, Math.ceil(normalized.split(/\s+/).length * 1.25));
}

function uniq(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}

function digestIssueTags(digest = {}, propositionsById = new Map()) {
  return uniq((digest.proposition_ids || []).flatMap(id => propositionsById.get(id)?.issue_tags || []));
}

function commonPayload({
  chunkId,
  chunkType,
  sourceObjectId,
  caseId = "",
  caseName = "",
  citation = "",
  court = "",
  judgmentDate = "",
  issueTags = [],
  authorityRole = "",
  authorityStrength = "",
  paragraphIds = [],
  propositionIds = [],
  principleIds = [],
  digestIds = [],
  sourceUrl = "",
  text = "",
  reviewStatus = "machine_candidate",
  currentTreatmentStatus = "unchecked",
} = {}) {
  const normalizedText = normalizeParagraphText(text);
  return {
    chunk_id: chunkId,
    chunk_type: chunkType,
    chunk_schema_version: CHUNK_SCHEMA_VERSION,
    source_object_id: sourceObjectId,
    case_id: caseId,
    case_name: caseName,
    citation,
    court,
    judgment_date: judgmentDate,
    issue_tags: uniq(issueTags),
    authority_role: authorityRole || "background",
    authority_strength: authorityStrength || "",
    paragraph_ids: uniq(paragraphIds),
    proposition_ids: uniq(propositionIds),
    principle_ids: uniq(principleIds),
    digest_ids: uniq(digestIds),
    source_url: sourceUrl,
    text: normalizedText,
    token_estimate: tokenEstimate(normalizedText),
    checksum: sha256(normalizedText),
    domain_id: "criminal_law_hk",
    source_kind: "case_law",
    current_treatment_status: currentTreatmentStatus || "unchecked",
    answer_layer_status: "research_only",
    review_status: reviewStatus,
  };
}

function courtStrength(court = "") {
  if (/Final Appeal/i.test(court)) return "cfa";
  if (/Appeal/i.test(court)) return "ca";
  if (/First Instance|High Court/i.test(court)) return "cfi";
  if (/District/i.test(court)) return "dc";
  if (/Magistr/i.test(court)) return "magistracy";
  return "";
}

function buildParagraphChunks(corpus) {
  return corpus.paragraphs.flatMap(paragraph => {
    const text = paragraph.paragraph_text;
    const base = commonPayload({
      chunkId: `chunk_${paragraph.paragraph_id}`,
      chunkType: "case_paragraph_chunk",
      sourceObjectId: paragraph.paragraph_id,
      caseId: paragraph.case_id,
      caseName: paragraph.case_name,
      citation: paragraph.neutral_citation,
      court: paragraph.court,
      judgmentDate: paragraph.judgment_date,
      issueTags: paragraph.issue_tags_candidate || [],
      authorityRole: paragraph.authority_role_candidate,
      authorityStrength: courtStrength(paragraph.court),
      paragraphIds: [paragraph.paragraph_id],
      sourceUrl: paragraph.source_url,
      text: `Paragraph ${paragraph.para_no}. ${text}`,
      reviewStatus: paragraph.review_status,
      currentTreatmentStatus: paragraph.current_treatment_status,
    });
    if (base.token_estimate <= SAFE_MAX_PARAGRAPH_TOKENS) return [base];
    return [{
      ...base,
      token_estimate_warning: "paragraph_exceeds_safe_max_but_not_split_to_preserve_legal_integrity",
    }];
  });
}

function buildPropositionChunks(corpus, paragraphById) {
  return corpus.propositions.map(prop => {
    const paragraph = (prop.source_paragraph_ids || []).map(id => paragraphById.get(id)).find(Boolean);
    return commonPayload({
      chunkId: `chunk_${prop.proposition_id}`,
      chunkType: "case_proposition_chunk",
      sourceObjectId: prop.proposition_id,
      caseId: prop.case_id,
      caseName: prop.case_name,
      citation: prop.neutral_citation,
      court: prop.court,
      judgmentDate: paragraph?.judgment_date || "",
      issueTags: prop.issue_tags || [],
      authorityRole: prop.authority_role_candidate,
      authorityStrength: courtStrength(prop.court),
      paragraphIds: prop.source_paragraph_ids || [],
      propositionIds: [prop.proposition_id],
      sourceUrl: paragraph?.source_url || prop.source_urls?.[0] || "",
      text: [
        prop.proposition_text,
        `Exact quote: ${prop.exact_quote_support}`,
        `Source paragraphs: ${(prop.source_paragraph_ids || []).join(", ")}`,
      ].join("\n"),
      reviewStatus: prop.review_status,
      currentTreatmentStatus: prop.current_treatment_status,
    });
  });
}

function buildPrincipleChunks(corpus, paragraphById) {
  return corpus.principles.filter(principleUsable).map(principle => {
    const paragraph = (principle.source_paragraph_ids || []).map(id => paragraphById.get(id)).find(Boolean);
    return commonPayload({
      chunkId: `chunk_${principle.principle_id}`,
      chunkType: "case_principle_chunk",
      sourceObjectId: principle.principle_id,
      caseId: principle.case_id || paragraph?.case_id || "",
      caseName: principle.case_name || paragraph?.case_name || "",
      citation: principle.neutral_citation || paragraph?.neutral_citation || "",
      court: principle.court || paragraph?.court || "",
      judgmentDate: paragraph?.judgment_date || "",
      issueTags: principle.issue_tags || [],
      authorityRole: "principle_candidate",
      authorityStrength: principle.authority_strength || courtStrength(paragraph?.court || ""),
      paragraphIds: principle.source_paragraph_ids || [],
      propositionIds: principle.source_proposition_ids || [],
      principleIds: [principle.principle_id],
      sourceUrl: paragraph?.source_url || principle.source_urls?.[0] || "",
      text: [
        principle.principle_text,
        `Required facts: ${(principle.required_facts || []).join(", ")}`,
        `Limits: ${principle.limits || ""}`,
        `Distinguishable when: ${principle.distinguishable_when || ""}`,
        `Exact quote: ${principle.exact_quote_support || ""}`,
        `Treatment: ${principle.current_treatment_status || "unchecked"}`,
      ].join("\n"),
      reviewStatus: principle.review_status,
      currentTreatmentStatus: principle.current_treatment_status,
    });
  });
}

function buildDigestChunks(corpus, propositionsById) {
  return corpus.digests.map(digest => commonPayload({
    chunkId: `chunk_${digest.case_digest_card_id}`,
    chunkType: "case_digest_chunk",
    sourceObjectId: digest.case_digest_card_id,
    caseId: digest.case_id,
    caseName: digest.case_name,
    citation: digest.neutral_citation,
    court: digest.court,
    judgmentDate: digest.judgment_date,
    issueTags: digestIssueTags(digest, propositionsById),
    authorityRole: "case_digest",
    authorityStrength: courtStrength(digest.court),
    paragraphIds: digest.key_paragraphs || [],
    propositionIds: digest.proposition_ids || [],
    principleIds: digest.principle_ids || [],
    digestIds: [digest.case_digest_card_id],
    sourceUrl: digest.hklii_paragraph_urls?.[0] || digest.source_url,
    text: [
      `${digest.case_name} ${digest.neutral_citation}`,
      `Facts: ${digest.facts_summary || ""}`,
      `Procedure: ${digest.procedural_history || ""}`,
      `Issues: ${(digest.issues || []).join(", ")}`,
      `Holdings: ${(digest.holdings || []).join(" ")}`,
      `Applies when: ${(digest.applies_when || []).join(" ")}`,
      `Distinguishable when: ${(digest.distinguishable_when || []).join(" ")}`,
      `Key paragraphs: ${(digest.key_paragraphs || []).join(", ")}`,
    ].join("\n"),
    reviewStatus: digest.review_status,
    currentTreatmentStatus: digest.current_treatment_status || digest.treatment?.current_treatment_status,
  }));
}

function buildIssueClusterChunks(corpus) {
  const paragraphById = byId(corpus.paragraphs, "paragraph_id");
  const propositionById = byId(corpus.propositions, "proposition_id");
  const principleById = byId(corpus.principles.filter(principleUsable), "principle_id");
  const digestByCaseId = byId(corpus.digests, "case_id");

  const byIssue = new Map();
  for (const mapItem of corpus.issueMap) {
    if (!byIssue.has(mapItem.issue_id)) byIssue.set(mapItem.issue_id, []);
    byIssue.get(mapItem.issue_id).push(mapItem);
  }

  return Array.from(byIssue.entries()).map(([issueId, mappings]) => {
    const topMappings = mappings
      .slice()
      .sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0))
      .slice(0, 10);
    const paragraphIds = uniq(topMappings.flatMap(item => item.paragraph_ids || []));
    const propositionIds = uniq(topMappings.flatMap(item => item.proposition_ids || []));
    const principleIds = uniq(topMappings.flatMap(item => item.principle_ids || []));
    const digestIds = uniq(topMappings.map(item => digestByCaseId.get(item.case_id)?.case_digest_card_id));
    const cases = topMappings.map(item => {
      const digest = digestByCaseId.get(item.case_id);
      return digest ? `${digest.case_name} ${digest.neutral_citation}` : item.case_id;
    });
    const firstParagraph = paragraphIds.map(id => paragraphById.get(id)).find(Boolean);
    const firstPrinciple = principleIds.map(id => principleById.get(id)).find(Boolean);
    const firstProp = propositionIds.map(id => propositionById.get(id)).find(Boolean);
    return commonPayload({
      chunkId: `chunk_issue_${issueId.replace(/[^a-z0-9]+/gi, "_")}`,
      chunkType: "issue_cluster_chunk",
      sourceObjectId: issueId,
      issueTags: [issueId],
      authorityRole: "issue_cluster",
      authorityStrength: firstPrinciple?.authority_strength || "",
      paragraphIds,
      propositionIds,
      principleIds,
      digestIds,
      sourceUrl: firstParagraph?.source_url || "",
      text: [
        `Issue: ${issueId}`,
        `Top cases: ${cases.join("; ")}`,
        `Representative proposition: ${firstProp?.proposition_text || ""}`,
        `Representative principle: ${firstPrinciple?.principle_text || ""}`,
      ].join("\n"),
      reviewStatus: "machine_candidate",
    });
  });
}

function buildCaseCorpusChunks({ mode = "sample" } = {}) {
  const corpus = loadCaseCorpus({ mode });
  const paragraphById = byId(corpus.paragraphs, "paragraph_id");
  const propositionsById = byId(corpus.propositions, "proposition_id");
  return []
    .concat(buildParagraphChunks(corpus))
    .concat(buildPropositionChunks(corpus, paragraphById))
    .concat(buildPrincipleChunks(corpus, paragraphById))
    .concat(buildDigestChunks(corpus, propositionsById))
    .concat(buildIssueClusterChunks(corpus));
}

module.exports = {
  CHUNK_SCHEMA_VERSION,
  SAFE_MAX_PARAGRAPH_TOKENS,
  tokenEstimate,
  buildCaseCorpusChunks,
};
