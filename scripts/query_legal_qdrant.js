#!/usr/bin/env node
/* eslint-disable no-console */

const { searchQdrant } = require("../src/legal_answer/qdrant_retriever");

function parseArgs(argv) {
  const args = { query: "", collection: "", topK: 5 };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--query") args.query = argv[++i] || "";
    else if (arg === "--collection") args.collection = argv[++i] || "";
    else if (arg === "--top-k") args.topK = Number(argv[++i] || 5);
  }
  if (!args.query) {
    args.query = "What is the consequence of inconsistent pleadings across proceedings?";
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const result = await searchQdrant({
    query: args.query,
    collectionName: args.collection,
    topK: args.topK,
  });
  const report = {
    query: result.query,
    collection: result.collection_name,
    embedding_provider: result.embedding_provider,
    dimension: result.dimension,
    hit_count: result.hits.length,
    hits: result.hits.map(hit => ({
      score: hit.score,
      id: hit.id,
      proposition_id: hit.payload?.proposition_id,
      paragraph_id: hit.payload?.paragraph_id,
      form_id: hit.payload?.form_id,
      batch_id: hit.payload?.batch_id,
      vector_scope: hit.payload?.vector_scope,
      title: hit.payload?.title,
      citation: hit.payload?.citation,
      pinpoint: hit.payload?.pinpoint,
      issue_tags: hit.payload?.issue_tags || [],
      authority_role: hit.payload?.authority_role,
      review_status: hit.payload?.review_status,
      answer_layer_status: hit.payload?.answer_layer_status,
      preview: hit.payload?.indexed_text_preview,
    })),
  };
  console.log(JSON.stringify(report, null, 2));
}

main().catch(error => {
  console.error(error.message);
  if (error.payload) console.error(JSON.stringify(error.payload, null, 2));
  process.exit(1);
});
