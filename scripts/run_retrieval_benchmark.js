#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");
const { buildEvidencePack } = require("../src/legal_answer/build_evidence_pack");

const ROOT = path.resolve(__dirname, "..");
const BENCHMARK_PATH = path.join(ROOT, "data", "legal_ingest", "mvp", "retrieval_benchmark_queries.json");

function hitMatches(query, chunks) {
  const ids = new Set();
  const kinds = new Set();
  for (const chunk of chunks) {
    ids.add(chunk.source?.source_id);
    ids.add(chunk.excerpt_id);
    kinds.add(chunk.source?.source_kind);
  }
  return {
    expected_hit: (query.expected_source_ids_any || []).some(id => ids.has(id)),
    source_kind_hit: (query.expected_source_kind_any || []).some(kind => kinds.has(kind)),
    private_leakage: (query.must_not_retrieve_source_kinds || []).filter(kind => kinds.has(kind)),
    retrieved_ids: Array.from(ids).filter(Boolean),
    retrieved_kinds: Array.from(kinds).filter(Boolean),
  };
}

async function runBenchmark({ topK = 10 } = {}) {
  const suite = JSON.parse(fs.readFileSync(BENCHMARK_PATH, "utf8"));
  const results = [];
  for (const query of suite.queries || []) {
    const pack = await buildEvidencePack({ query: query.query, topK, sourceMode: "public_demo" });
    const match = hitMatches(query, pack.evidence_chunks || []);
    results.push({
      id: query.id,
      query: query.query,
      expected_hit: match.expected_hit,
      source_kind_hit: match.source_kind_hit,
      private_leakage: match.private_leakage,
      retrieved_ids: match.retrieved_ids,
      retrieved_kinds: match.retrieved_kinds,
      returned_count: pack.evidence_chunks.length,
    });
  }
  const total = results.length || 1;
  const hits = results.filter(result => result.expected_hit).length;
  const privateLeakage = results.filter(result => result.private_leakage.length);
  const missing = results.filter(result => !result.expected_hit);
  const hitRate = Number((hits / total).toFixed(3));
  const floor = suite.quality_floor || {};
  const qualitySatisfied = hitRate >= Number(floor.min_hit_rate || 0.6) && privateLeakage.length === 0;
  return {
    suite_id: suite.suite_id,
    top_k: topK,
    query_count: results.length,
    hit_count: hits,
    hit_rate: hitRate,
    quality_floor: floor,
    quality_status: qualitySatisfied ? "quality_floor_satisfied" : "insufficient_needs_more_corpus_or_better_retrieval",
    missing_expected_source_report: missing.map(result => ({ id: result.id, query: result.query, retrieved_ids: result.retrieved_ids })),
    private_source_leakage_report: privateLeakage,
    low_confidence_retrieval_report: missing.slice(0, 10),
    results,
  };
}

if (require.main === module) {
  runBenchmark().then(report => {
    console.log(JSON.stringify(report, null, 2));
  }).catch(error => {
    console.error(error.message);
    if (error.payload) console.error(JSON.stringify(error.payload, null, 2));
    process.exit(1);
  });
}

module.exports = { runBenchmark };
