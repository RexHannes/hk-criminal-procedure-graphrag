#!/usr/bin/env node
/* Summarize the idempotent sample L1-L3.5 ingest/chunk/embed/index/eval pipeline. */

const fs = require("fs");
const path = require("path");
const {
  ROOT,
  PATHS,
  loadCaseCorpus,
  writeJsonl,
  readJsonl,
} = require("../src/legal_answer/case_corpus/case_corpus_store");
const { buildFetchCacheManifest } = require("../src/legal_answer/case_corpus/source_fetch_cache");
const { buildDuplicatesReport } = require("../src/legal_answer/case_corpus/dedupe");

const INGEST_STATUS_JSON = path.join(ROOT, "artifacts", "case_corpus_ingest_run_status.json");
const INGEST_STATUS_MD = path.join(ROOT, "artifacts", "case_corpus_ingest_run_status.md");
const L35_STATUS_JSON = path.join(ROOT, "artifacts", "case_corpus_l1_l35_status.json");
const L35_STATUS_MD = path.join(ROOT, "artifacts", "case_corpus_l1_l35_status.md");
const QDRANT_DRY_RUN_JSON = path.join(ROOT, "artifacts", "case_corpus_qdrant_dry_run.json");
const EMBEDDING_DRY_RUN_JSON = path.join(ROOT, "artifacts", "case_corpus_embedding_dry_run.json");
const RETRIEVAL_EVAL_JSON = path.join(ROOT, "artifacts", "case_corpus_retrieval_eval.json");

function nowFixed() {
  return "2026-06-29T00:00:00.000Z";
}

function artifactPath(filePath) {
  return path.relative(ROOT, filePath);
}

function stage(name, attempted, success, artifactPaths = [], skipped = 0) {
  return {
    stage: name,
    attempted_count: attempted,
    success_count: success,
    failed_count: Math.max(0, attempted - success),
    skipped_count: skipped,
    retryable_failures: [],
    non_retryable_failures: [],
    elapsed_ms: 0,
    artifact_paths: artifactPaths.map(artifactPath),
  };
}

function readJsonIfExists(filePath, fallback = {}) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : fallback;
}

function buildIngestQueue(corpus) {
  return corpus.registry.map(item => ({
    queue_id: `ingest_${item.case_id}`,
    case_id: item.case_id,
    case_name: item.case_name,
    neutral_citation: item.neutral_citation,
    source_url: item.source_url,
    source_system: item.source_system,
    stages: [
      "discover_case",
      "fetch_public_source",
      "cache_raw_source",
      "normalize_text",
      "paragraphize",
      "create_paragraph_cards",
      "extract_propositions",
      "build_principles",
      "build_digests",
      "issue_map",
      "chunk",
      "embed_dry_run_vectorize",
      "index_dry_run",
      "evaluate_retrieval",
    ],
    source_visibility: "public",
    answer_layer_status: "research_only",
    review_status: "lawyer_review_required",
  }));
}

function countBy(records, keyFn) {
  const counts = {};
  for (const record of records) {
    const key = keyFn(record) || "unknown";
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function updateMainStatus({ corpus, chunks, embeddingSummary, qdrantSummary, evalReport, duplicatesReport, ingestReport }) {
  const status = readJsonIfExists(L35_STATUS_JSON, {});
  const chunkCountByType = countBy(chunks, item => item.chunk_type);
  status.chunk_count_by_type = chunkCountByType;
  status.embedded_chunk_count = embeddingSummary.embedded_chunk_count || 0;
  status.dry_run_vector_count = qdrantSummary.dry_run_vector_count || 0;
  status.qdrant_collection_targets = qdrantSummary.qdrant_collection_targets || {};
  status.retrieval_eval_precision_at_5 = evalReport.metrics?.precision_at_5 || 0;
  status.retrieval_eval_recall_at_10 = evalReport.metrics?.recall_at_10 || 0;
  status.retrieval_eval_legacy_corpus_recall_at_10 = evalReport.metrics?.legacy_corpus_recall_at_10 || 0;
  status.retrieval_recall_improvement = Number(((evalReport.metrics?.recall_at_10 || 0) - 0.341798).toFixed(6));
  status.source_proof_rate = evalReport.metrics?.source_proof_rate || 0;
  status.wrong_domain_leak_rate = evalReport.metrics?.wrong_domain_leak_rate || 0;
  status.unsupported_query_abstention_rate = evalReport.metrics?.unsupported_query_abstention_rate || 0;
  status.duplicate_rate = duplicatesReport.duplicate_rate || 0;
  status.failed_ingest_count = ingestReport.stage_summary.reduce((sum, item) => sum + item.failed_count, 0);
  status.retryable_failure_count = ingestReport.stage_summary.reduce((sum, item) => sum + item.retryable_failures.length, 0);
  status.ingest_queue_count = corpus.registry.length;
  fs.writeFileSync(L35_STATUS_JSON, `${JSON.stringify(status, null, 2)}\n`, "utf8");

  if (fs.existsSync(L35_STATUS_MD)) {
    const original = fs.readFileSync(L35_STATUS_MD, "utf8").replace(/\n## RAG Pipeline Metrics[\s\S]*$/m, "").trimEnd();
    const lines = [
      original,
      "",
      "## RAG Pipeline Metrics",
      "",
      "| Metric | Value |",
      "|---|---:|",
      `| Total chunks | ${chunks.length} |`,
      `| Embedded chunks | ${status.embedded_chunk_count} |`,
      `| Dry-run vectors | ${status.dry_run_vector_count} |`,
      `| Retrieval eval Precision@5 | ${status.retrieval_eval_precision_at_5} |`,
      `| Retrieval eval Recall@10 | ${status.retrieval_eval_recall_at_10} |`,
      `| Retrieval legacy corpus Recall@10 | ${status.retrieval_eval_legacy_corpus_recall_at_10} |`,
      `| Retrieval Recall@10 improvement vs prior | ${status.retrieval_recall_improvement} |`,
      `| Source proof rate | ${status.source_proof_rate} |`,
      `| Wrong-domain leak rate | ${status.wrong_domain_leak_rate} |`,
      `| Unsupported-query abstention rate | ${status.unsupported_query_abstention_rate} |`,
      `| Duplicate rate | ${status.duplicate_rate} |`,
      `| Failed ingest count | ${status.failed_ingest_count} |`,
      `| Retryable failure count | ${status.retryable_failure_count} |`,
      "",
    ];
    fs.writeFileSync(L35_STATUS_MD, `${lines.join("\n")}`, "utf8");
  }
}

function writeMarkdown(report) {
  const lines = [
    "# Case Corpus Ingest Run Status",
    "",
    "Idempotent sample ingest/chunk/embed/index/eval run for the 100-case public HKLII corpus. Network fetching and live Qdrant writes are disabled in CI.",
    "",
    "| Stage | Attempted | Success | Failed | Skipped |",
    "|---|---:|---:|---:|---:|",
    ...report.stage_summary.map(item => `| ${item.stage} | ${item.attempted_count} | ${item.success_count} | ${item.failed_count} | ${item.skipped_count} |`),
    "",
    "## Outputs",
    "",
    ...report.output_artifacts.map(item => `- ${item}`),
    "",
  ];
  fs.writeFileSync(INGEST_STATUS_MD, `${lines.join("\n")}`, "utf8");
}

function main() {
  const corpus = loadCaseCorpus({ mode: "sample" });
  const chunks = readJsonl(PATHS.chunksSample);
  const embedded = readJsonl(PATHS.embeddedChunksManifestSample);
  const fetchManifest = buildFetchCacheManifest({ write: true });
  const ingestQueue = buildIngestQueue(corpus);
  writeJsonl(PATHS.ingestQueueSample, ingestQueue);
  const duplicatesReport = buildDuplicatesReport({ mode: "sample", write: true });
  const embeddingSummary = readJsonIfExists(EMBEDDING_DRY_RUN_JSON, {});
  const qdrantSummary = readJsonIfExists(QDRANT_DRY_RUN_JSON, {});
  const evalReport = readJsonIfExists(RETRIEVAL_EVAL_JSON, { metrics: {} });

  const stageSummary = [
    stage("discover_case", corpus.registry.length, corpus.registry.length, [PATHS.registrySample, PATHS.ingestQueueSample]),
    stage("fetch_public_source", corpus.registry.length, fetchManifest.length, [PATHS.fetchCacheManifestSample]),
    stage("cache_raw_source", corpus.registry.length, fetchManifest.length, [PATHS.fetchCacheManifestSample]),
    stage("normalize_text", corpus.paragraphs.length, corpus.paragraphs.length, [PATHS.paragraphsSample]),
    stage("paragraphize", corpus.registry.length, new Set(corpus.paragraphs.map(item => item.case_id)).size, [PATHS.paragraphsSample]),
    stage("create_paragraph_cards", corpus.paragraphs.length, corpus.paragraphs.length, [PATHS.paragraphsSample]),
    stage("extract_propositions", corpus.propositions.length, corpus.propositions.length, [PATHS.propositionsSample]),
    stage("build_principles", corpus.principles.length, corpus.principles.length, [PATHS.principlesSample]),
    stage("build_digests", corpus.digests.length, corpus.digests.length, [PATHS.digestsSample]),
    stage("issue_map", corpus.issueMap.length, corpus.issueMap.length, [PATHS.issueMapSample]),
    stage("chunk", chunks.length, chunks.length, [PATHS.chunksSample]),
    stage("embed_dry_run_vectorize", chunks.length, embedded.length, [PATHS.embeddedChunksManifestSample, EMBEDDING_DRY_RUN_JSON]),
    stage("index_dry_run", chunks.length, qdrantSummary.dry_run_vector_count || 0, [QDRANT_DRY_RUN_JSON]),
    stage("evaluate_retrieval", (evalReport.query_results || []).length, (evalReport.query_results || []).length, [RETRIEVAL_EVAL_JSON, path.join(ROOT, "artifacts", "case_corpus_retrieval_eval.md")]),
  ];

  const report = {
    run_id: "case_corpus_ingest_run_sample_100_v1",
    generated_at: nowFixed(),
    mode: "sample",
    network_fetch_allowed: false,
    live_qdrant_write_allowed: false,
    registry_case_count: corpus.registry.length,
    chunk_count: chunks.length,
    embedded_chunk_count: embedded.length,
    dry_run_vector_count: qdrantSummary.dry_run_vector_count || 0,
    retrieval_eval_metrics: evalReport.metrics || {},
    duplicate_rate: duplicatesReport.duplicate_rate,
    stage_summary: stageSummary,
    output_artifacts: [
      artifactPath(PATHS.ingestQueueSample),
      artifactPath(PATHS.fetchCacheManifestSample),
      artifactPath(PATHS.chunksSample),
      artifactPath(PATHS.embeddedChunksManifestSample),
      artifactPath(QDRANT_DRY_RUN_JSON),
      artifactPath(RETRIEVAL_EVAL_JSON),
      artifactPath(INGEST_STATUS_JSON),
      artifactPath(INGEST_STATUS_MD),
    ],
    status: stageSummary.every(item => item.failed_count === 0) ? "passed" : "completed_with_failures",
  };

  fs.mkdirSync(path.dirname(INGEST_STATUS_JSON), { recursive: true });
  fs.writeFileSync(INGEST_STATUS_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeMarkdown(report);
  updateMainStatus({ corpus, chunks, embeddingSummary, qdrantSummary, evalReport, duplicatesReport, ingestReport: report });
  console.log(JSON.stringify({ script: "run_case_corpus_ingest_pipeline", status: report.status, stage_count: stageSummary.length }, null, 2));
  if (report.status !== "passed") process.exit(1);
}

main();
