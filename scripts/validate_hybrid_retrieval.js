#!/usr/bin/env node
/* eslint-disable no-console */

const { retrieveHybridEvidence, mergeAndRerank } = require("../src/legal_answer/hybrid_retriever");

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

(async () => {
  const errors = [];
  const pack = await retrieveHybridEvidence({
    query: "What is the consequence of inconsistent pleadings and abuse of process?",
    topK: 5,
  });
  assert(pack.retrieval_mode === "hybrid_vector_lexical_metadata_v1", "hybrid retrieval mode missing", errors);
  assert(pack.hybrid_trace?.metadata_filters_preserved, "metadata filters must be preserved", errors);
  assert(pack.hybrid_trace?.source_mode === "public_demo", "public demo source mode expected", errors);
  assert(pack.hybrid_trace?.tenant_id === "public", "public tenant expected", errors);
  assert((pack.evidence_chunks || []).length > 0, "hybrid retrieval should return evidence chunks", errors);
  assert(pack.evidence_chunks.every(chunk => Number.isFinite(chunk.hybrid_score)), "each reranked chunk needs hybrid_score", errors);
  assert(pack.evidence_chunks.every(chunk => chunk.source?.source_visibility === "public_demo"), "public hybrid retrieval must use public_demo sources", errors);
  assert(pack.evidence_chunks.every(chunk => chunk.source?.tenant_id === "public"), "public hybrid retrieval must use tenant_id public", errors);

  const reranked = mergeAndRerank({
    query: "alpha",
    evidenceChunks: [
      { excerpt_id: "a", excerpt: "alpha", source: { retrieval_score: 0.1 }, review_status: "lawyer_review_required" },
      { excerpt_id: "a", excerpt: "alpha alpha", source: { retrieval_score: 0.2 }, review_status: "approved" },
    ],
  });
  assert(reranked.length === 1, "mergeAndRerank must deduplicate by excerpt_id", errors);
  assert(reranked[0].review_status === "approved", "higher hybrid score duplicate should win", errors);

  if (errors.length) {
    console.error("Hybrid retrieval validation failed:");
    errors.forEach(error => console.error(`- ${error}`));
    process.exit(1);
  }
  console.log("Hybrid retrieval validation passed.");
})().catch(error => {
  console.error(error.message);
  if (error.payload) console.error(JSON.stringify(error.payload, null, 2));
  process.exit(1);
});
