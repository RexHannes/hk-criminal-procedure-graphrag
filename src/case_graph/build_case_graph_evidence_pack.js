const crypto = require("crypto");
const path = require("path");
const { evidenceChunk, legalSource, retrievalTrace } = require("../legal_answer/schema");
const { retrieveCaseGraph } = require("./retrieve_case_graph");

const ROOT = path.resolve(__dirname, "..", "..");
const BASE = path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1");

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function chunkFromCaseGraphHit(hit) {
  const chunkId = hit.proposition_id;
  const source = legalSource({
    source_id: hit.proposition_id,
    source_kind: "proposition_card",
    title: hit.case_id,
    jurisdiction: "HK",
    case_name: hit.case_id,
    paragraph: hit.source_paragraph,
    chunk_id: chunkId,
    chunk_hash: sha256(`${chunkId}:${hit.exact_quote}`),
    retrieval_score: hit.retrieval_score,
    retrieval_stage: "case_graph",
    source_visibility: hit.source_visibility,
    tenant_id: hit.tenant_id,
  });
  return evidenceChunk({
    excerpt_id: chunkId,
    chunk_id: chunkId,
    chunk_hash: source.chunk_hash,
    excerpt: hit.exact_quote,
    source,
    issue_tags: hit.tree_node_ids || [],
    authority_role: hit.authority_role,
    answer_layer_status: hit.review_state === "answer_safe" ? "answer_safe" : "research_only",
    review_status: hit.review_state === "answer_safe" ? "approved" : "lawyer_review_required",
    warnings: hit.review_state === "answer_safe" ? [] : ["case_graph_card_requires_human_review"],
  });
}

async function buildCaseGraphEvidencePack({
  query,
  topK = 5,
  propositionArtifactPath = path.join(BASE, "fixtures", "sample_proposition_cards.attached.json"),
  taxonomyPath = path.join(BASE, "evidence_taxonomy.json"),
  filters = {},
} = {}) {
  const result = retrieveCaseGraph({ query, propositionArtifactPath, taxonomyPath, filters, topK });
  const chunks = result.hits.map(chunkFromCaseGraphHit);
  const warnings = Array.from(new Set([...result.warnings, ...chunks.flatMap(chunk => chunk.warnings || [])]));
  return {
    evidence_pack_id: sha256(`case_graph:${query}:${chunks.map(chunk => chunk.chunk_id).join("|")}`).slice(0, 24),
    query,
    built_at: new Date().toISOString(),
    public_demo_mode: true,
    collection_name: "case_graph_fixture",
    evidence_chunks: chunks,
    proposition_families: result.likely_tree_node_ids.map(nodeId => ({
      family: nodeId,
      excerpt_ids: chunks.filter(chunk => (chunk.issue_tags || []).includes(nodeId)).map(chunk => chunk.excerpt_id),
    })),
    sources: chunks.map(chunk => chunk.source),
    retrieval_trace: retrievalTrace({
      query,
      collection_name: "case_graph_fixture",
      top_k: topK,
      returned_count: chunks.length,
      retrieval_mode: "case_graph_tree_first_v1",
      scores: result.hits.map(hit => hit.retrieval_score),
      stages: ["classify_tree_node", "retrieve_proposition_cards", "attach_source_paragraphs"],
      warnings,
    }),
    source_mode: "public_demo",
    tenant_id: "public",
    retrieval_filter: filters,
    warnings,
  };
}

module.exports = {
  buildCaseGraphEvidencePack,
  chunkFromCaseGraphHit,
};
