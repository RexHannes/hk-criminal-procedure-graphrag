#!/usr/bin/env node
/* Dry-run or index L1-L3.5 case corpus chunks into Qdrant-ready payloads. */

const fs = require("fs");
const path = require("path");
const {
  ROOT,
  PATHS,
  readJsonl,
  loadCaseCorpus,
} = require("../src/legal_answer/case_corpus/case_corpus_store");
const { buildCaseCorpusChunks } = require("../src/legal_answer/case_corpus/chunker");
const { embeddingConfig, payloadForChunk } = require("../src/legal_answer/case_corpus/embedding_config");

const OUT_JSON = path.join(ROOT, "artifacts", "case_corpus_qdrant_dry_run.json");

function hasFlag(name) {
  return process.argv.includes(name);
}

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const dryRun = hasFlag("--dry-run") || !hasFlag("--write") || !process.env.QDRANT_URL;
const noNetwork = hasFlag("--no-network") || dryRun;
const sample = hasFlag("--sample") || dryRun;
const limit = Number(argValue("--limit", "0"));
const config = embeddingConfig();
const collection = argValue("--collection", `hk_case_corpus_chunks_${config.embedding_model.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}_${config.vector_dimension}`);

if (!dryRun || !noNetwork) {
  console.error("Live Qdrant indexing is intentionally blocked in this PR. Run with --dry-run --sample --no-network until provider and collection guards are reviewed.");
  process.exit(1);
}

let chunks = readJsonl(PATHS.chunksSample, { optional: true });
if (!chunks.length) chunks = buildCaseCorpusChunks({ mode: sample ? "sample" : "full" });
const selected = limit > 0 ? chunks.slice(0, limit) : chunks;
const points = selected.map(chunk => ({
  id: chunk.chunk_id,
  text: chunk.text,
  payload: payloadForChunk(chunk, config),
}));
const corpus = loadCaseCorpus({ mode: sample ? "sample" : "full" });

const legacyCollectionTargets = {
  hk_case_paragraphs_openrouter_2048: corpus.paragraphs.length,
  hk_case_propositions_openrouter_2048: corpus.propositions.length,
  hk_case_principles_openrouter_2048: corpus.principles.length,
  hk_case_digests_openrouter_2048: corpus.digests.length,
};

const summary = {
  indexer: "index_case_corpus_qdrant",
  dry_run: dryRun,
  no_network: noNetwork,
  mode: sample ? "sample" : "full",
  embedding_config: config,
  collection,
  qdrant_collection_targets: {
    primary_chunk_collection: collection,
    legacy_artifact_collections: legacyCollectionTargets,
  },
  dry_run_vector_count: points.length,
  sample_payload: points[0]?.payload || null,
  status: "dry_run_ready_no_provider_calls",
};

fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
fs.writeFileSync(OUT_JSON, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.log(JSON.stringify(summary, null, 2));
