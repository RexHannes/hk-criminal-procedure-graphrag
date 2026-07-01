const crypto = require("crypto");
const { evidenceChunk, legalSource, retrievalTrace } = require("./schema");
const { searchQdrant } = require("./qdrant_retriever");

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function sourceKindFromPayload(payload = {}) {
  if (payload.source_type === "case" || payload.source_type === "case_judgment") return payload.proposition_id ? "proposition_card" : "case";
  if (payload.source_type === "case_judgment_recall") return "case_judgment_recall";
  if (payload.source_type === "form_metadata") return "form_metadata";
  if (payload.source_type === "practice_direction") return "practice_direction";
  if (payload.source_type === "legislation") return "ordinance";
  if (payload.visibility === "licensed_private") return "textbook_private";
  if (payload.visibility === "firm_private") return "precedent_private";
  return "other";
}

function sourceFromHit(hit, collectionName) {
  const payload = hit.payload || {};
  const chunkId = payload.proposition_id || payload.paragraph_id || payload.form_id || String(hit.id);
  return legalSource({
    source_id: payload.source_id || payload.proposition_id || payload.paragraph_id || payload.form_id || String(hit.id),
    source_kind: sourceKindFromPayload(payload),
    title: payload.title,
    jurisdiction: payload.jurisdiction || "HK",
    court: payload.court_level,
    case_name: payload.title,
    neutral_citation: payload.citation,
    paragraph: payload.pinpoint || payload.paragraph_id,
    url_or_path: payload.url_or_path || payload.source_url || payload.source_url_or_path,
    chunk_id: chunkId,
    chunk_hash: sha256(`${collectionName}:${chunkId}:${payload.indexed_text_preview || ""}`),
    retrieval_score: hit.score,
    retrieval_stage: "qdrant",
    source_visibility: payload.source_visibility || payload.visibility || "",
    tenant_id: payload.tenant_id || payload.firm_id || "",
  });
}

function excerptFromHit(hit) {
  const payload = hit.payload || {};
  return payload.supporting_quote || payload.indexed_text_preview || payload.title || "";
}

function warningsForHit(hit) {
  const payload = hit.payload || {};
  const warnings = [];
  if (!payload.source_id) warnings.push("missing_source_id");
  if (!payload.proposition_id && !payload.paragraph_id && !payload.form_id) warnings.push("missing_chunk_identifier");
  if (!payload.citation && payload.source_type === "case") warnings.push("missing_case_citation");
  if (!payload.pinpoint && payload.source_type === "case") warnings.push("missing_case_pinpoint");
  if (payload.visibility === "licensed_private" || payload.visibility === "firm_private") warnings.push("private_source_requires_authorization");
  return warnings;
}

function chunkFromHit(hit, collectionName) {
  const payload = hit.payload || {};
  const source = sourceFromHit(hit, collectionName);
  return evidenceChunk({
    excerpt_id: source.chunk_id,
    chunk_id: source.chunk_id,
    chunk_hash: source.chunk_hash,
    excerpt: excerptFromHit(hit),
    source,
    issue_tags: payload.issue_tags || [],
    authority_role: payload.authority_role,
    answer_layer_status: payload.answer_layer_status,
    review_status: payload.review_status,
    warnings: warningsForHit(hit),
  });
}

function groupByPropositionFamily(chunks) {
  const groups = new Map();
  for (const chunk of chunks) {
    const tags = chunk.issue_tags && chunk.issue_tags.length ? chunk.issue_tags : ["ungrouped"];
    const key = tags[0];
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(chunk.excerpt_id);
  }
  return Array.from(groups.entries()).map(([family, excerpt_ids]) => ({ family, excerpt_ids }));
}

async function buildEvidencePack({
  query,
  collectionName,
  topK = 5,
  publicDemoMode = true,
  sourceMode = "public_demo",
  tenantId = "public",
  includePrivate = false,
} = {}) {
  if (!query) throw new Error("query required");
  const result = await searchQdrant({ query, collectionName, topK, sourceMode, tenantId, includePrivate });
  const chunks = result.hits.map(hit => chunkFromHit(hit, result.collection_name));
  const warnings = Array.from(new Set(chunks.flatMap(chunk => chunk.warnings || [])));
  if (!chunks.length) warnings.push("no_qdrant_hits");
  if (publicDemoMode && chunks.some(chunk => ["textbook_private", "precedent_private"].includes(chunk.source.source_kind))) {
    warnings.push("private_source_in_public_demo_mode");
  }
  const trace = retrievalTrace({
    query,
    collection_name: result.collection_name,
    top_k: topK,
    returned_count: chunks.length,
    retrieval_mode: "qdrant",
    scores: result.hits.map(hit => hit.score),
    stages: ["qdrant"],
    warnings,
  });
  return {
    evidence_pack_id: sha256(`${query}:${result.collection_name}:${chunks.map(chunk => chunk.excerpt_id).join("|")}`).slice(0, 24),
    query,
    built_at: new Date().toISOString(),
    public_demo_mode: publicDemoMode,
    collection_name: result.collection_name,
    evidence_chunks: chunks,
    proposition_families: groupByPropositionFamily(chunks),
    sources: chunks.map(chunk => chunk.source),
    retrieval_trace: trace,
    source_mode: result.source_mode,
    tenant_id: result.tenant_id,
    retrieval_filter: result.filter,
    warnings,
  };
}

module.exports = {
  buildEvidencePack,
  chunkFromHit,
  groupByPropositionFamily,
  sourceFromHit,
};
