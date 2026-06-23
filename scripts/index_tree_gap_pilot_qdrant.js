#!/usr/bin/env node
/* eslint-disable no-console */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { exactJsonHeaders } = require("../src/api/json_content_type");
const { embed } = require("../src/legal_answer/qdrant_retriever");

const ROOT = path.resolve(__dirname, "..");
const PILOTS_DIR = path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "tree_gap_pilots");

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

function arrayFromPayload(payload, key) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.[key])) return payload[key];
  return [];
}

function uuidFromText(text) {
  const hex = crypto.createHash("sha256").update(text).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function parseArgs(argv) {
  const args = { pilot: "", dryRun: false };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--pilot") args.pilot = argv[++i] || "";
    else if (argv[i] === "--dry-run") args.dryRun = true;
  }
  return args;
}

function embeddingModelFor(env, provider) {
  if (provider === "openai") return env.LEGAL_EMBEDDING_MODEL || env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
  if (provider === "voyage") return env.LEGAL_EMBEDDING_MODEL || env.VOYAGE_EMBEDDING_MODEL || "voyage-3-large";
  if (provider === "cohere") return env.LEGAL_EMBEDDING_MODEL || env.COHERE_EMBEDDING_MODEL || "embed-v4.0";
  return "local-hash-v1";
}

async function qdrantRequest(env, pathAndQuery, { method = "GET", body, ok = [200, 201] } = {}) {
  const base = String(env.QDRANT_URL || "").replace(/\/$/, "");
  if (!base) throw new Error("QDRANT_URL missing");
  const headers = exactJsonHeaders({});
  if (env.QDRANT_API_KEY) headers["api-key"] = env.QDRANT_API_KEY;
  const response = await fetch(`${base}${pathAndQuery}`, {
    method,
    headers,
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
    const error = new Error(`Qdrant HTTP ${response.status} ${method} ${pathAndQuery}`);
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function ensureCollection(env, collectionName, dimension) {
  try {
    const existing = await qdrantRequest(env, `/collections/${encodeURIComponent(collectionName)}`);
    const info = existing.result || {};
    const currentSize = info.config?.params?.vectors?.size;
    if (currentSize !== dimension) throw new Error(`${collectionName} vector size ${currentSize} != requested ${dimension}`);
    return { collection: collectionName, status: "exists", vector_size: currentSize, points_count: info.points_count || 0 };
  } catch (error) {
    if (!String(error.message || "").includes("Qdrant HTTP 404")) throw error;
  }
  await qdrantRequest(env, `/collections/${encodeURIComponent(collectionName)}`, {
    method: "PUT",
    body: { vectors: { size: dimension, distance: "Cosine" } },
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

async function main() {
  const args = parseArgs(process.argv);
  if (!args.pilot) throw new Error("--pilot is required");
  const env = loadEnv();
  const pilotDir = path.join(PILOTS_DIR, args.pilot);
  const manifest = readJson(path.join(pilotDir, "source_manifest.json"));
  const paragraphPayload = readJson(path.join(pilotDir, "paragraph_cards.json"));
  const propositionPayload = readJson(path.join(pilotDir, "proposition_cards.json"));
  const paragraphs = arrayFromPayload(paragraphPayload, "paragraph_cards");
  const propositions = arrayFromPayload(propositionPayload, "proposition_cards");
  const sourceByCaseId = new Map((manifest.sources || []).map(source => [source.case_id, source]));
  const provider = env.LEGAL_EMBEDDING_PROVIDER || "local-hash";
  const dimension = Number(env.LEGAL_EMBEDDING_DIM || (provider === "openai" ? 1536 : 384));
  const embeddingModel = embeddingModelFor(env, provider);
  const collections = {
    paragraphs: env.QDRANT_COLLECTION_PARAGRAPHS || "hk_legal_paragraphs",
    propositions: env.QDRANT_COLLECTION_PROPOSITIONS || "hk_proposition_cards",
  };
  const paragraphPoints = [];
  let actualDimension = dimension;

  for (const paragraph of paragraphs) {
    const source = sourceByCaseId.get(paragraph.case_id) || {};
    const vector = await embed(`${source.neutral_citation || ""} ${paragraph.paragraph_no}\n${paragraph.text}\n${manifest.scope || ""}`, env, dimension);
    actualDimension = vector.length;
    paragraphPoints.push({
      id: uuidFromText(`${manifest.batch_id}:${paragraph.paragraph_id}`),
      vector,
      payload: {
        batch_id: manifest.batch_id,
        vector_scope: manifest.batch_id,
        embedding_provider: provider,
        embedding_model: embeddingModel,
        tokenizer_version: provider === "local-hash" ? "regex_local_hash_v1" : "provider_tokenizer",
        source_id: paragraph.case_id,
        source_type: "case_judgment",
        jurisdiction: "Hong Kong",
        practice_area: "criminal_law",
        issue_tags: [manifest.scope || manifest.batch_id],
        court_level: source.court_level || "",
        authority_role: "paragraph_text",
        review_status: "machine_candidate",
        answer_layer_status: "candidate_only",
        visibility: "public_source",
        source_visibility: "public_demo",
        tenant_id: "public",
        paragraph_id: paragraph.paragraph_id,
        citation: source.neutral_citation || "",
        pinpoint: paragraph.paragraph_no || "",
        source_url: paragraph.source_url,
        indexed_text_preview: String(paragraph.text || "").slice(0, 500),
      },
    });
  }

  const propositionPoints = [];
  for (const card of propositions) {
    const source = sourceByCaseId.get(card.case_id) || {};
    const vector = await embed(`${card.proposition_text}\n${card.exact_quote}\n${(card.target_doctrine_node_ids || []).join(" ")}`, env, actualDimension);
    if (vector.length !== actualDimension) throw new Error(`Embedding dimension drift for ${card.proposition_id}`);
    propositionPoints.push({
      id: uuidFromText(`${manifest.batch_id}:${card.proposition_id}`),
      vector,
      payload: {
        batch_id: manifest.batch_id,
        vector_scope: manifest.batch_id,
        embedding_provider: provider,
        embedding_model: embeddingModel,
        tokenizer_version: provider === "local-hash" ? "regex_local_hash_v1" : "provider_tokenizer",
        source_id: card.case_id,
        source_type: "case_judgment",
        jurisdiction: "Hong Kong",
        practice_area: "criminal_law",
        issue_tags: card.target_doctrine_node_ids || [],
        court_level: source.court_level || "",
        authority_role: card.authority_role,
        review_status: "machine_candidate",
        answer_layer_status: "candidate_only",
        visibility: "public_source",
        source_visibility: "public_demo",
        tenant_id: "public",
        proposition_id: card.proposition_id,
        paragraph_id: card.paragraph_id,
        citation: source.neutral_citation || "",
        pinpoint: card.source_paragraph || "",
        supporting_quote: card.exact_quote,
        source_url: card.source_url,
        indexed_text_preview: String(card.proposition_text || "").slice(0, 500),
      },
    });
  }

  const report = {
    indexer: "tree_gap_pilot_qdrant_v1",
    pilot_id: args.pilot,
    batch_id: manifest.batch_id,
    dry_run: args.dryRun,
    qdrant_configured: Boolean(env.QDRANT_URL),
    embedding_provider: provider,
    embedding_model: embeddingModel,
    dimension: actualDimension,
    collections,
    point_counts: {
      paragraphs: paragraphPoints.length,
      propositions: propositionPoints.length,
    },
    answer_policy: "candidate_only_no_answer_safe_promotion",
  };

  if (args.dryRun) {
    report.status = "dry_run_ready";
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  await ensureCollection(env, collections.paragraphs, actualDimension);
  await ensureCollection(env, collections.propositions, actualDimension);
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
