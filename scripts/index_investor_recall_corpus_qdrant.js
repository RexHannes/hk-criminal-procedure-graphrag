#!/usr/bin/env node
/* eslint-disable no-console */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { embed } = require("../src/legal_answer/qdrant_retriever");
const {
  assertScaleIndexAllowed,
  embeddingVectorSpaceId,
  resolveQdrantCollection,
  resolvedEmbeddingProvider,
} = require("../src/retrieval/runtime_isolation");
const { defaultFreeOpenRouterEmbeddingDim } = require("../src/retrieval/openrouter_free_models");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_CORPUS = path.join(ROOT, "data", "legal_ingest", "investor_recall", "corpus_v1", "case_recall_cards.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const [key, ...rest] = line.split("=");
    const value = rest.join("=").trim().replace(/^['"]|['"]$/g, "");
    if (value) env[key.trim()] = value;
  }
  return env;
}

function loadEnv() {
  return {
    ...parseEnvFile(path.join(ROOT, ".env")),
    ...parseEnvFile(path.join(ROOT, ".env.local")),
    ...process.env,
  };
}

function uuidFromText(text) {
  const hex = crypto.createHash("sha256").update(text).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function qdrantHeaders(env) {
  const headers = { "Content-Type": "application/json" };
  if (env.QDRANT_API_KEY) headers["api-key"] = env.QDRANT_API_KEY;
  return headers;
}

async function qdrantRequest(env, pathAndQuery, { method = "GET", body, ok = [200, 201] } = {}) {
  const base = String(env.QDRANT_URL || "").replace(/\/$/, "");
  if (!base) throw new Error("QDRANT_URL missing");
  const response = await fetch(`${base}${pathAndQuery}`, {
    method,
    headers: qdrantHeaders(env),
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  if (!ok.includes(response.status)) {
    const err = new Error(`Qdrant HTTP ${response.status} ${method} ${pathAndQuery}`);
    err.payload = payload;
    throw err;
  }
  return payload;
}

async function ensureCollection(env, collection, dimension) {
  try {
    await qdrantRequest(env, `/collections/${encodeURIComponent(collection)}`);
    return { status: "exists" };
  } catch {
    await qdrantRequest(env, `/collections/${encodeURIComponent(collection)}`, {
      method: "PUT",
      body: { vectors: { size: dimension, distance: "Cosine" } },
    });
    return { status: "created" };
  }
}

async function upsertBatch(env, collection, points) {
  if (!points.length) return;
  await qdrantRequest(env, `/collections/${encodeURIComponent(collection)}/points?wait=true`, {
    method: "PUT",
    body: { points },
  });
}

function parseArgs(argv) {
  const args = { corpus: DEFAULT_CORPUS, dryRun: false, batchSize: 64 };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--corpus") args.corpus = path.resolve(ROOT, argv[++i] || "");
    else if (argv[i] === "--dry-run") args.dryRun = true;
    else if (argv[i] === "--batch-size") args.batchSize = Number(argv[++i] || args.batchSize);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const env = loadEnv();
  const payload = readJson(args.corpus);
  const cards = payload.case_recall_cards || [];
  const isolation = assertScaleIndexAllowed(env, "index_investor_recall_corpus");
  const provider = resolvedEmbeddingProvider(env);
  const dimension = Number(env.LEGAL_EMBEDDING_DIM || defaultFreeOpenRouterEmbeddingDim());
  const collection = env.QDRANT_COLLECTION_CASE_RECALL
    || env.QDRANT_COLLECTION_PROPOSITIONS
    || resolveQdrantCollection("hk_proposition_cards", env, "QDRANT_COLLECTION_PROPOSITIONS");
  const vectorSpaceId = embeddingVectorSpaceId(env);

  if (args.dryRun) {
    console.log(JSON.stringify({
      indexer: "investor_recall_corpus_qdrant_v1",
      dry_run: true,
      case_count: cards.length,
      collection,
      dimension,
      provider,
    }, null, 2));
    return;
  }

  await ensureCollection(env, collection, dimension);
  let indexed = 0;
  let batch = [];
  for (const card of cards) {
    const text = `${card.neutral_citation || ""} ${card.case_name || ""}\n${card.recall_text || ""}\nHong Kong criminal procedure evidence`;
    const vector = await embed(text, env, dimension);
    batch.push({
      id: uuidFromText(`investor_recall:${card.case_id}`),
      vector,
      payload: {
        source_id: card.case_id,
        source_type: "case_judgment_recall",
        fruit_tier: card.fruit_tier || "recall_index",
        accuracy_tier: card.accuracy_tier || "investor_recall",
        answer_layer_status: "case_recall_only",
        review_status: "machine_candidate",
        source_visibility: "public_demo",
        tenant_id: "public",
        domain_id: card.domain_id || "criminal_procedure_hk",
        practice_area: card.practice_area || "criminal_procedure",
        vector_scope: card.vector_scope || "investor_recall_corpus_v1",
        vector_space_id: vectorSpaceId,
        runtime_mode: isolation.mode,
        embedding_provider: provider,
        citation: card.neutral_citation,
        title: card.case_name,
        court_level: card.court_level || "",
        legalref_dis: card.dis,
        source_url: card.source_url_or_path,
        indexed_text_preview: (card.recall_text || "").slice(0, 500),
        criminal_likely: card.criminal_likely === true,
      },
    });
    if (batch.length >= args.batchSize) {
      await upsertBatch(env, collection, batch);
      indexed += batch.length;
      batch = [];
      if (indexed % 512 === 0) console.error(`indexed ${indexed}/${cards.length}`);
    }
  }
  if (batch.length) {
    await upsertBatch(env, collection, batch);
    indexed += batch.length;
  }

  console.log(JSON.stringify({
    indexer: "investor_recall_corpus_qdrant_v1",
    case_count: cards.length,
    indexed_count: indexed,
    collection,
    dimension,
    vector_space_id: vectorSpaceId,
    status: indexed === cards.length ? "indexed" : "partial",
  }, null, 2));
}

main().catch(error => {
  console.error(error.message);
  if (error.payload) console.error(JSON.stringify(error.payload, null, 2));
  process.exit(1);
});
