#!/usr/bin/env node
/* eslint-disable no-console */

const crypto = require("crypto");
const fs = require("fs");
const { defaultFreeOpenRouterEmbeddingDim, defaultFreeOpenRouterEmbeddingModel } = require("../src/retrieval/openrouter_free_models");
const path = require("path");
const { embed } = require("../src/legal_answer/qdrant_retriever");
const {
  assertScaleIndexAllowed,
  embeddingVectorSpaceId,
  resolveQdrantCollection,
  resolvedEmbeddingProvider,
} = require("../src/retrieval/runtime_isolation");

const ROOT = path.resolve(__dirname, "..");
const BATCH_DIR = path.join(
  ROOT,
  "data",
  "legal_ingest",
  "criminal_evidence_tree_v1",
  "bail_public_batch_v1",
);

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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function uuidFromText(text) {
  const hex = crypto.createHash("sha256").update(text).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function embeddingModelFor(env, provider) {
  if (provider === "openai") return env.LEGAL_EMBEDDING_MODEL || env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
  if (provider === "openrouter") {
    return env.LEGAL_EMBEDDING_MODEL || env.OPENROUTER_EMBEDDING_MODEL || defaultFreeOpenRouterEmbeddingModel();
  }
  if (provider === "voyage") return env.LEGAL_EMBEDDING_MODEL || env.VOYAGE_EMBEDDING_MODEL || "voyage-3-large";
  if (provider === "cohere") return env.LEGAL_EMBEDDING_MODEL || env.COHERE_EMBEDDING_MODEL || "embed-v4.0";
  if (provider === "openrouter") return env.LEGAL_EMBEDDING_MODEL || env.OPENROUTER_EMBEDDING_MODEL || "nvidia/llama-nemotron-embed-vl-1b-v2:free";
  return "local-hash-v1";
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
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  if (!ok.includes(response.status)) {
    const err = new Error(`Qdrant HTTP ${response.status} ${method} ${pathAndQuery}`);
    err.payload = payload;
    throw err;
  }
  return payload;
}

async function ensureCollection(env, collectionName, dimension) {
  try {
    const existing = await qdrantRequest(env, `/collections/${encodeURIComponent(collectionName)}`);
    const info = existing.result || {};
    const currentSize = info.config?.params?.vectors?.size;
    const currentDistance = info.config?.params?.vectors?.distance;
    if (currentSize !== dimension) {
      throw new Error(`${collectionName} vector size ${currentSize} != requested ${dimension}. Use a separate collection or reindex intentionally.`);
    }
    if (currentDistance !== "Cosine") {
      throw new Error(`${collectionName} distance ${currentDistance} != Cosine`);
    }
    return { collection: collectionName, status: "exists", vector_size: currentSize, points_count: info.points_count || 0 };
  } catch (error) {
    if (!String(error.message || "").includes("Qdrant HTTP 404")) throw error;
  }
  await qdrantRequest(env, `/collections/${encodeURIComponent(collectionName)}`, {
    method: "PUT",
    body: {
      vectors: { size: dimension, distance: "Cosine" },
    },
    ok: [200, 201],
  });
  return { collection: collectionName, status: "created", vector_size: dimension, points_count: 0 };
}

async function upsertPoints(env, collectionName, points) {
  if (!points.length) return;
  await qdrantRequest(env, `/collections/${encodeURIComponent(collectionName)}/points?wait=true`, {
    method: "PUT",
    body: { points },
  });
}

function buildBatchRecords() {
  const manifest = readJson(path.join(BATCH_DIR, "source_manifest.json"));
  const paragraphPayload = readJson(path.join(BATCH_DIR, "paragraph_cards.json"));
  const propositionPayload = readJson(path.join(BATCH_DIR, "proposition_cards.json"));
  const sourceByCaseId = new Map((manifest.sources || []).map(source => [source.case_id, source]));
  const caseById = new Map((paragraphPayload.cases || []).map(item => [item.case_id, item]));
  const paragraphs = (paragraphPayload.paragraph_cards || []).map(paragraph => {
    const source = sourceByCaseId.get(paragraph.case_id) || {};
    const legalCase = caseById.get(paragraph.case_id) || {};
    return {
      paragraph_id: paragraph.paragraph_id,
      case_id: paragraph.case_id,
      citation: legalCase.neutral_citation || source.neutral_citation || "",
      pinpoint: paragraph.paragraph_no || "",
      paragraph_text: paragraph.text,
      issue_tags: ["criminal_procedure", "bail"],
      jurisdiction: "Hong Kong",
      court: legalCase.court_level || source.court_level || "",
      source_id: paragraph.case_id,
      source_url: paragraph.source_url,
      review_status: "machine_candidate",
      answer_layer_status: "candidate_only",
      visibility: "public_source",
    };
  });
  const propositions = (propositionPayload.proposition_cards || []).map(card => {
    const source = sourceByCaseId.get(card.case_id) || {};
    const legalCase = caseById.get(card.case_id) || {};
    return {
      proposition_id: card.proposition_id,
      paragraph_id: card.paragraph_id,
      source_id: card.case_id,
      citation: legalCase.neutral_citation || source.neutral_citation || "",
      pinpoint: card.source_paragraph || "",
      proposition_text: card.proposition_text,
      supporting_quote: card.exact_quote,
      issue_tags: card.target_doctrine_node_ids || [],
      authority_role: card.authority_role || "applied_principle",
      jurisdiction: "Hong Kong",
      court: legalCase.court_level || source.court_level || "",
      review_status: "machine_candidate",
      answer_layer_status: "candidate_only",
      visibility: "public_source",
      source_url: card.source_url,
    };
  });
  return { manifest, paragraphs, propositions };
}

async function main() {
  const env = loadEnv();
  const dryRun = process.argv.includes("--dry-run");
  const isolation = assertScaleIndexAllowed(env, "index_public_bail_batch_qdrant");
  const provider = resolvedEmbeddingProvider(env);
  const configuredDimension = Number(env.LEGAL_EMBEDDING_DIM || (provider === "openrouter" ? defaultFreeOpenRouterEmbeddingDim() : provider === "openai" ? 1536 : 384));
  const embeddingModel = embeddingModelFor(env, provider);
  const vectorSpaceId = embeddingVectorSpaceId(env);
  const collections = {
    paragraphs: resolveQdrantCollection("hk_legal_paragraphs", env, "QDRANT_COLLECTION_PARAGRAPHS"),
    propositions: resolveQdrantCollection("hk_proposition_cards", env, "QDRANT_COLLECTION_PROPOSITIONS"),
  };
  const { manifest, paragraphs, propositions } = buildBatchRecords();
  if (dryRun) {
    console.log(JSON.stringify({
      indexer: "public_bail_batch_qdrant_v1",
      batch_id: manifest.batch_id,
      dry_run: true,
      qdrant_configured: Boolean(env.QDRANT_URL),
      embedding_provider: provider,
      embedding_model: embeddingModel,
      dimension: configuredDimension,
      collections,
      point_counts: {
        paragraphs: paragraphs.length,
        propositions: propositions.length,
      },
      review_policy: "candidate_only_except_reviewed_gold_set_no_auto_promotion",
      status: "dry_run_ready_no_provider_calls",
    }, null, 2));
    return;
  }
  const paragraphPoints = [];
  let actualDimension = configuredDimension;
  for (const paragraph of paragraphs) {
    const textForEmbedding = `${paragraph.citation} ${paragraph.pinpoint}\n${paragraph.paragraph_text}\ncriminal_procedure bail`;
    const vector = await embed(textForEmbedding, env, configuredDimension);
    actualDimension = vector.length;
    paragraphPoints.push({
      id: uuidFromText(`bail_public_batch_v1:${paragraph.paragraph_id}`),
      vector,
      payload: {
      batch_id: manifest.batch_id,
      domain_id: manifest.domain_id || "criminal_procedure_hk",
      vector_scope: "bail_public_batch_v1",
      vector_space_id: vectorSpaceId,
      runtime_mode: isolation.mode,
      embedding_provider: provider,
      embedding_model: embeddingModel,
      tokenizer_version: provider === "local-hash" ? "regex_local_hash_v1" : "provider_tokenizer",
      source_id: paragraph.source_id,
      domain_id: "criminal_procedure_hk",
      source_type: "case_judgment",
      jurisdiction: "Hong Kong",
      practice_area: "criminal_procedure",
      issue_tags: paragraph.issue_tags,
      court_level: paragraph.court,
      authority_role: "paragraph_text",
      review_status: paragraph.review_status,
      answer_layer_status: paragraph.answer_layer_status,
      visibility: paragraph.visibility,
      source_visibility: "public_demo",
      tenant_id: "public",
      paragraph_id: paragraph.paragraph_id,
      citation: paragraph.citation,
      pinpoint: paragraph.pinpoint,
      source_url: paragraph.source_url,
      indexed_text_preview: paragraph.paragraph_text.slice(0, 500),
      },
    });
  }
  const propositionPoints = [];
  for (const card of propositions) {
    const textForEmbedding = `${card.proposition_text}\n${card.supporting_quote}\n${(card.issue_tags || []).join(" ")}`;
    const vector = await embed(textForEmbedding, env, actualDimension);
    if (vector.length !== actualDimension) {
      throw new Error(`Embedding dimension drift for ${card.proposition_id}: ${vector.length} != ${actualDimension}`);
    }
    propositionPoints.push({
      id: uuidFromText(`bail_public_batch_v1:${card.proposition_id}`),
      vector,
      payload: {
      batch_id: manifest.batch_id,
      domain_id: manifest.domain_id || "criminal_procedure_hk",
      vector_scope: "bail_public_batch_v1",
      vector_space_id: vectorSpaceId,
      runtime_mode: isolation.mode,
      embedding_provider: provider,
      embedding_model: embeddingModel,
      tokenizer_version: provider === "local-hash" ? "regex_local_hash_v1" : "provider_tokenizer",
      source_id: card.source_id,
      domain_id: "criminal_procedure_hk",
      source_type: "case_judgment",
      jurisdiction: "Hong Kong",
      practice_area: "criminal_procedure",
      issue_tags: card.issue_tags,
      court_level: card.court,
      authority_role: card.authority_role,
      review_status: card.review_status,
      answer_layer_status: card.answer_layer_status,
      visibility: card.visibility,
      source_visibility: "public_demo",
      tenant_id: "public",
      proposition_id: card.proposition_id,
      paragraph_id: card.paragraph_id,
      citation: card.citation,
      pinpoint: card.pinpoint,
      supporting_quote: card.supporting_quote,
      source_url: card.source_url,
      indexed_text_preview: card.proposition_text.slice(0, 500),
      },
    });
  }
  const report = {
    indexer: "public_bail_batch_qdrant_v1",
    batch_id: manifest.batch_id,
    dry_run: dryRun,
    qdrant_configured: Boolean(env.QDRANT_URL),
    embedding_provider: provider,
    embedding_model: embeddingModel,
    dimension: actualDimension,
    collections,
    point_counts: {
      paragraphs: paragraphPoints.length,
      propositions: propositionPoints.length,
    },
    review_policy: "machine_candidate_only_no_answer_safe_promotion",
  };
  if (!env.QDRANT_URL || dryRun) {
    report.status = env.QDRANT_URL ? "dry_run_ready" : "skipped_missing_qdrant_url";
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  report.collection_status = [
    await ensureCollection(env, collections.paragraphs, actualDimension),
    await ensureCollection(env, collections.propositions, actualDimension),
  ];
  await upsertPoints(env, collections.paragraphs, paragraphPoints);
  await upsertPoints(env, collections.propositions, propositionPoints);
  report.status = "indexed";
  console.log(JSON.stringify(report, null, 2));
}

main().catch(error => {
  console.error(error.message);
  if (error.payload) console.error(JSON.stringify(error.payload, null, 2));
  process.exit(1);
});
