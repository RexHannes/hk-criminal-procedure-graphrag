const fs = require("fs");
const path = require("path");
const { authorityEvidenceForNode } = require("./case_authority_bridge");

const INDEX_PATH = path.join(process.cwd(), "data", "legal_ingest", "case_corpus", "viewer_evidence_index.json");
const SEED_SOURCES_PATH = path.join(process.cwd(), "data", "legal_ingest", "case_corpus", "viewer_seed_case_public_sources.json");

let cachedIndex = null;
let cachedSeedSources = null;

function loadViewerEvidenceIndex() {
  if (cachedIndex) return cachedIndex;
  if (!fs.existsSync(INDEX_PATH)) {
    cachedIndex = { evidence: [], mappings: [] };
    return cachedIndex;
  }
  cachedIndex = JSON.parse(fs.readFileSync(INDEX_PATH, "utf8"));
  return cachedIndex;
}

function loadViewerSeedCaseSources() {
  if (cachedSeedSources) return cachedSeedSources;
  if (!fs.existsSync(SEED_SOURCES_PATH)) {
    cachedSeedSources = { evidence: [] };
    return cachedSeedSources;
  }
  cachedSeedSources = JSON.parse(fs.readFileSync(SEED_SOURCES_PATH, "utf8"));
  return cachedSeedSources;
}

function suffixId(nodeId) {
  const parts = String(nodeId || "").split(".");
  return parts[parts.length - 1] || "";
}

function mappingMatchesNodeId(mapping, nodeId) {
  const id = String(nodeId || "");
  const suffix = suffixId(id);
  const doctrineIds = new Set([...(mapping.doctrine_node_ids || []), mapping.doctrine_node_id].filter(Boolean));
  const viewerIds = new Set([...(mapping.viewer_node_ids || []), mapping.viewer_node_id].filter(Boolean));
  const flowStepIds = new Set([...(mapping.flow_step_ids || []), mapping.flow_step_id].filter(Boolean));
  return doctrineIds.has(id) || viewerIds.has(id) || viewerIds.has(suffix) || flowStepIds.has(id) || flowStepIds.has(suffix);
}

function seedSourceMatchesNodeId(item, nodeId) {
  const id = String(nodeId || "");
  const suffix = suffixId(id);
  const sourceIds = new Set([...(item.source_node_ids || []), item.source_node_id].filter(Boolean));
  const doctrineIds = new Set([...(item.doctrine_node_ids || []), item.doctrine_node_id].filter(Boolean));
  return sourceIds.has(id) || sourceIds.has(suffix) || doctrineIds.has(id);
}

function normalizeViewerEvidenceItem(item) {
  const quote = item.supporting_quote || item.exact_quote || "";
  const {
    needs_lawyer_review,
    lawyer_review_required,
    human_review_status,
    validator_flags,
    ...rest
  } = item;
  return {
    ...rest,
    neutral_citation: item.neutral_citation || item.citation || "",
    para_no: item.para_no || item.paragraph_number || "",
    supporting_quote: quote,
    verification_status: item.verification_status || "paragraph_linked_public_source",
    source_verification_status: item.source_verification_status || "source_verified_public",
    public_source_link_verified: Boolean(item.source_url && /#p\d+/i.test(item.source_url) && quote),
    answer_layer_status: item.answer_layer_status || "research_only",
    answer_mode: item.answer_mode || "research_prototype",
    answer_safe: false,
    lawyer_review_status: item.lawyer_review_status || "unreviewed",
    professional_advice_certified: item.professional_advice_certified === true ? true : false,
    usable_in_research_prototype: true,
    validator_flags: Array.from(new Set([...(validator_flags || []), "public_paragraph_proof", "research_prototype"])),
  };
}

function hasPublicParagraphProof(item) {
  const quote = item.supporting_quote || item.exact_quote || "";
  return Boolean(
    item.source_url &&
    /(?:hklii\.hk|legalref\.judiciary\.hk)/i.test(item.source_url) &&
    /#p\d+/i.test(item.source_url) &&
    (item.para_no || item.paragraph_number) &&
    quote &&
    item.paragraph_text &&
    String(item.paragraph_text).includes(quote)
  );
}

function rankViewerEvidence(items) {
  const rank = item => {
    if (item.usable_in_answer_layer) return 0;
    if (item.liability_relevance === "liability" || item.liability_relevance === "procedure") return 1;
    if (item.principle_quality_status === "demoted") return 3;
    return 2;
  };
  return items.slice().sort((a, b) =>
    rank(a) - rank(b) ||
    String(a.neutral_citation || a.citation || "").localeCompare(String(b.neutral_citation || b.citation || "")) ||
    String(a.para_no || a.paragraph_number || "").localeCompare(String(b.para_no || b.paragraph_number || ""), undefined, { numeric: true })
  );
}

function viewerCaseCorpusEvidenceForNode(nodeId, limit = 12) {
  const registryEvidence = authorityEvidenceForNode(nodeId, limit)
    .map(normalizeViewerEvidenceItem)
    .filter(hasPublicParagraphProof);
  if (registryEvidence.length) return rankViewerEvidence(registryEvidence).slice(0, limit);

  const seedEvidence = (loadViewerSeedCaseSources().evidence || [])
    .filter(item => seedSourceMatchesNodeId(item, nodeId))
    .map(normalizeViewerEvidenceItem)
    .filter(hasPublicParagraphProof);
  if (seedEvidence.length) return rankViewerEvidence(seedEvidence).slice(0, limit);

  const index = loadViewerEvidenceIndex();
  const mappings = (index.mappings || []).filter(mapping => mappingMatchesNodeId(mapping, nodeId));
  if (!mappings.length) return [];
  const issueTags = new Set(mappings.map(mapping => mapping.issue_tag).filter(Boolean));
  const seen = new Set();
  const evidence = [];
  for (const item of rankViewerEvidence(index.evidence || [])) {
    if (!issueTags.has(item.issue_tag) && !(item.issue_tags || []).some(tag => issueTags.has(tag))) continue;
    const key = item.evidence_id || `${item.issue_tag}:${item.paragraph_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const normalized = normalizeViewerEvidenceItem(item);
    if (!hasPublicParagraphProof(normalized)) continue;
    evidence.push(normalized);
    if (evidence.length >= limit) break;
  }
  return evidence;
}

module.exports = {
  loadViewerEvidenceIndex,
  loadViewerSeedCaseSources,
  viewerCaseCorpusEvidenceForNode,
  hasPublicParagraphProof,
};
