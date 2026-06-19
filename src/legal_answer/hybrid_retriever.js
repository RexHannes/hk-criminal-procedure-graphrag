const { buildEvidencePack } = require("./build_evidence_pack");

function tokenize(value) {
  return String(value || "").toLowerCase().split(/[^a-z0-9\u4e00-\u9fff]+/).filter(token => token.length >= 3);
}

function lexicalScore(query, chunk) {
  const terms = new Set(tokenize(query));
  const haystack = [
    chunk.excerpt,
    chunk.source?.title,
    chunk.source?.neutral_citation,
    ...(chunk.issue_tags || []),
  ].join(" ").toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (haystack.includes(term)) score += 1;
  }
  return score;
}

function mergeAndRerank({ query, evidenceChunks, limit = 8 }) {
  const seen = new Map();
  for (const chunk of evidenceChunks || []) {
    const key = chunk.excerpt_id || chunk.chunk_id;
    const lexical = lexicalScore(query, chunk);
    const vectorScore = Number(chunk.source?.retrieval_score || 0);
    const reviewBoost = chunk.review_status === "approved" ? 2 : chunk.review_status === "lawyer_review_required" ? 0.25 : 0;
    const score = lexical + vectorScore + reviewBoost;
    const current = seen.get(key);
    if (!current || current.hybrid_score < score) {
      seen.set(key, {
        ...chunk,
        hybrid_score: Number(score.toFixed(6)),
        retrieval_components: {
          lexical_score: lexical,
          vector_score: vectorScore,
          review_boost: reviewBoost,
        },
      });
    }
  }
  return Array.from(seen.values())
    .sort((a, b) => b.hybrid_score - a.hybrid_score)
    .slice(0, limit);
}

async function retrieveHybridEvidence({
  query,
  topK = 8,
  sourceMode = "public_demo",
  tenantId = "public",
  includePrivate = false,
} = {}) {
  const evidencePack = await buildEvidencePack({
    query,
    topK,
    sourceMode,
    tenantId,
    includePrivate,
  });
  const reranked = mergeAndRerank({ query, evidenceChunks: evidencePack.evidence_chunks, limit: topK });
  return {
    ...evidencePack,
    retrieval_mode: "hybrid_vector_lexical_metadata_v1",
    evidence_chunks: reranked,
    hybrid_trace: {
      vector_collection: evidencePack.collection_name,
      lexical_stage: "local_token_overlap",
      reranker_provider: "local_deterministic",
      metadata_filters_preserved: Boolean(evidencePack.retrieval_filter),
      source_mode: evidencePack.source_mode,
      tenant_id: evidencePack.tenant_id,
    },
  };
}

module.exports = {
  lexicalScore,
  mergeAndRerank,
  retrieveHybridEvidence,
};
