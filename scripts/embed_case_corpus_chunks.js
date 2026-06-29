#!/usr/bin/env node
/* Dry-run embed case corpus chunks with deterministic local vectors. */

const fs = require("fs");
const path = require("path");
const {
  ROOT,
  PATHS,
  readJsonl,
  writeJsonl,
} = require("../src/legal_answer/case_corpus/case_corpus_store");
const {
  embeddingConfig,
  deterministicVector,
  vectorChecksum,
  payloadForChunk,
} = require("../src/legal_answer/case_corpus/embedding_config");

const OUT_JSON = path.join(ROOT, "artifacts", "case_corpus_embedding_dry_run.json");

function hasFlag(name) {
  return process.argv.includes(name);
}

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const dryRun = hasFlag("--dry-run") || hasFlag("--no-network") || !hasFlag("--write");
const noNetwork = hasFlag("--no-network") || dryRun;
const limit = Number(argValue("--limit", "0"));
const config = embeddingConfig();

if (!dryRun || !noNetwork) {
  console.error("Live embedding calls are blocked in PR6. Use --dry-run --sample --no-network.");
  process.exit(1);
}

const chunks = readJsonl(PATHS.chunksSample);
const selected = limit > 0 ? chunks.slice(0, limit) : chunks;
const records = selected.map(chunk => {
  const vector = deterministicVector(chunk.text, { dimension: config.vector_dimension });
  return {
    chunk_id: chunk.chunk_id,
    chunk_type: chunk.chunk_type,
    source_object_id: chunk.source_object_id,
    text_checksum: chunk.checksum,
    vector_dimension: config.vector_dimension,
    embedding_model: config.embedding_model,
    embedding_version: config.embedding_version,
    vector_checksum: vectorChecksum(vector),
    payload: payloadForChunk(chunk, config),
    dry_run: true,
    network_used: false,
  };
});

writeJsonl(PATHS.embeddedChunksManifestSample, records);
const summary = {
  script: "embed_case_corpus_chunks",
  dry_run: true,
  no_network: true,
  sample: hasFlag("--sample"),
  embedding_config: config,
  chunk_count: chunks.length,
  embedded_chunk_count: records.length,
  output: "data/legal_ingest/case_corpus/embedded_chunks_manifest_sample_100.jsonl",
  status: "dry_run_ready_no_provider_calls",
};
fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
fs.writeFileSync(OUT_JSON, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.log(JSON.stringify(summary, null, 2));
