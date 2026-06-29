#!/usr/bin/env node
/* Build searchable L1-L3.5 chunks from the committed case-corpus artifacts. */

const {
  PATHS,
  writeJsonl,
} = require("../src/legal_answer/case_corpus/case_corpus_store");
const { buildCaseCorpusChunks } = require("../src/legal_answer/case_corpus/chunker");

function hasFlag(name) {
  return process.argv.includes(name);
}

const sample = hasFlag("--sample") || !process.argv.includes("--full");
const chunks = buildCaseCorpusChunks({ mode: sample ? "sample" : "full" });

const errors = [];
const ids = new Set();
for (const chunk of chunks) {
  if (!chunk.chunk_id || ids.has(chunk.chunk_id)) errors.push(`${chunk.chunk_id}: missing/duplicate chunk_id`);
  ids.add(chunk.chunk_id);
  if (!chunk.chunk_type) errors.push(`${chunk.chunk_id}: missing chunk_type`);
  if (!chunk.source_object_id) errors.push(`${chunk.chunk_id}: missing source_object_id`);
  if (!chunk.text || chunk.text.length < 20) errors.push(`${chunk.chunk_id}: text too short`);
  if (!chunk.token_estimate || chunk.token_estimate < 1) errors.push(`${chunk.chunk_id}: missing token_estimate`);
  if (!chunk.checksum) errors.push(`${chunk.chunk_id}: missing checksum`);
  if (chunk.answer_layer_status !== "research_only") errors.push(`${chunk.chunk_id}: must be research_only`);
  if (!chunk.review_status) errors.push(`${chunk.chunk_id}: missing review_status`);
}

if (errors.length) {
  console.error("Case corpus chunk build failed:");
  errors.slice(0, 50).forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

writeJsonl(PATHS.chunksSample, chunks);
const byType = {};
for (const chunk of chunks) byType[chunk.chunk_type] = (byType[chunk.chunk_type] || 0) + 1;
console.log(JSON.stringify({
  script: "build_case_corpus_chunks",
  mode: sample ? "sample" : "full",
  chunk_count: chunks.length,
  chunk_count_by_type: byType,
  output: "data/legal_ingest/case_corpus/chunks_sample_100.jsonl",
  status: "passed",
}, null, 2));
