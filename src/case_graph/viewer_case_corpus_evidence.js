const fs = require("fs");
const path = require("path");

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
  return {
    ...item,
    neutral_citation: item.neutral_citation || item.citation || "",
    para_no: item.para_no || item.paragraph_number || "",
    supporting_quote: quote,
    verification_status: item.verification_status || "paragraph_linked_public_source",
    source_verification_status: item.source_verification_status || "source_verified_public",
    public_source_link_verified: Boolean(item.source_url && /#p\d+/i.test(item.source_url) && quote),
    answer_layer_status: item.answer_layer_status || "research_only",
    answer_safe: false,
    needs_lawyer_review: true,
    lawyer_review_required: true,
    human_review_status: "lawyer_review_required",
    validator_flags: Array.from(new Set([...(item.validator_flags || []), "answer_safe=false", "lawyer_review_required"])),
  };
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
  const seedEvidence = (loadViewerSeedCaseSources().evidence || [])
    .filter(item => seedSourceMatchesNodeId(item, nodeId))
    .map(normalizeViewerEvidenceItem);
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
    evidence.push(normalizeViewerEvidenceItem(item));
    if (evidence.length >= limit) break;
  }
  return evidence;
}

module.exports = {
  loadViewerEvidenceIndex,
  loadViewerSeedCaseSources,
  viewerCaseCorpusEvidenceForNode,
};
