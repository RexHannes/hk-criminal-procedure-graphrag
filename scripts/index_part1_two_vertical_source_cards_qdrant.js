#!/usr/bin/env node
/* Index Part 1 source/principle/case-digest cards into Qdrant. Defaults to dry-run. */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { exactJsonHeaders } = require("../src/api/json_content_type");
const { loadResearchCards } = require("../src/legal_answer/applied_analysis/research_card_store");
const { embed } = require("../src/legal_answer/qdrant_retriever");

const ROOT = path.resolve(__dirname, "..");

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

function parseArgs(argv) {
  return {
    dryRun: !argv.includes("--live"),
  };
}

function uuidFromText(text) {
  const hex = crypto.createHash("sha256").update(text).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function embeddingModelFor(env, provider) {
  if (provider === "openrouter") return env.LEGAL_EMBEDDING_MODEL || env.OPENROUTER_EMBEDDING_MODEL || "nvidia/llama-nemotron-embed-vl-1b-v2:free";
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
  const payload = text ? JSON.parse(text) : null;
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
    const currentSize = existing.result?.config?.params?.vectors?.size;
    if (currentSize !== dimension) throw new Error(`${collectionName} vector size ${currentSize} != requested ${dimension}`);
    return { status: "exists", collectionName, dimension };
  } catch (error) {
    if (!String(error.message || "").includes("Qdrant HTTP 404")) throw error;
  }
  await qdrantRequest(env, `/collections/${encodeURIComponent(collectionName)}`, {
    method: "PUT",
    body: { vectors: { size: dimension, distance: "Cosine" } },
  });
  return { status: "created", collectionName, dimension };
}

function recordsFromCards(cards) {
  const sources = cards.source_cards.map(card => ({
    id: card.source_card_id,
    kind: "source_card",
    text: `${card.title}\n${card.verified_text_excerpt}\n${(card.issue_tags || []).join(" ")}`,
    payload: {
      record_kind: "source_card",
      source_card_id: card.source_card_id,
      domain_id: card.domain_id,
      source_kind: card.source_kind,
      cap: card.cap || "",
      section: card.section || "",
      paragraph_id: (card.paragraph_refs || []).join(","),
      source_url: card.official_url,
      hklii_url: card.hklii_url || "",
      issue_tags: card.issue_tags || [],
      answer_layer_status: card.answer_layer_status,
      review_status: card.review_status,
    },
  }));
  const principles = cards.principle_cards.map(card => ({
    id: card.principle_id,
    kind: "principle_card",
    text: `${card.principle_text}\n${card.exact_quote}\n${card.scope || ""}`,
    payload: {
      record_kind: "principle_card",
      principle_id: card.principle_id,
      domain_id: card.domain_id,
      source_card_ids: card.source_card_ids || [],
      paragraph_or_section: card.paragraph_or_section,
      issue_tags: card.linked_scenarios || [],
      answer_layer_status: card.answer_layer_status,
      review_status: "lawyer_review_required",
    },
  }));
  const digests = cards.case_digest_cards.map(card => ({
    id: card.case_digest_card_id,
    kind: "case_digest_card",
    text: `${card.case_name} ${card.citation}\n${card.facts_summary}\n${(card.holdings || []).join("\n")}\n${(card.exact_quotes || []).join("\n")}`,
    payload: {
      record_kind: "case_digest_card",
      case_digest_card_id: card.case_digest_card_id,
      domain_id: card.domain_id,
      case_name: card.case_name,
      citation: card.citation,
      court: card.court,
      paragraph_id: (card.key_paragraphs || []).join(","),
      source_url: card.source_url,
      hklii_paragraph_urls: card.hklii_paragraph_urls || [],
      answer_layer_status: card.answer_layer_status,
      review_status: card.review_status,
    },
  }));
  return [...sources, ...principles, ...digests];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = loadEnv();
  const cards = loadResearchCards();
  const records = recordsFromCards(cards);
  const provider = env.LEGAL_EMBEDDING_PROVIDER || "local-hash";
  const dimension = Number(env.LEGAL_EMBEDDING_DIM || (provider === "openai" ? 1536 : 384));
  const embeddingModel = embeddingModelFor(env, provider);
  const collection = env.QDRANT_COLLECTION_SOURCE_CARDS || "hk_legal_source_cards";
  if (args.dryRun) {
    console.log(JSON.stringify({
      indexer: "part1_two_vertical_source_cards_qdrant_v1",
      dry_run: true,
      qdrant_configured: Boolean(env.QDRANT_URL),
      embedding_provider: provider,
      embedding_model: embeddingModel,
      dimension,
      collection,
      point_counts: {
        total: records.length,
        source_cards: cards.source_cards.length,
        principle_cards: cards.principle_cards.length,
        case_digest_cards: cards.case_digest_cards.length,
      },
      status: "dry_run_ready_no_provider_calls",
    }, null, 2));
    return;
  }

  const points = [];
  let actualDimension = dimension;
  for (const record of records) {
    const vector = await embed(record.text, env, actualDimension);
    actualDimension = vector.length;
    points.push({
      id: uuidFromText(`part1_two_vertical:${record.kind}:${record.id}`),
      vector,
      payload: {
        batch_id: "part1_two_vertical_source_cards_v1",
        embedding_provider: provider,
        embedding_model: embeddingModel,
        ...record.payload,
      },
    });
  }
  const collectionStatus = await ensureCollection(env, collection, actualDimension);
  await qdrantRequest(env, `/collections/${encodeURIComponent(collection)}/points?wait=true`, {
    method: "PUT",
    body: { points },
  });
  console.log(JSON.stringify({
    indexer: "part1_two_vertical_source_cards_qdrant_v1",
    dry_run: false,
    collection,
    collection_status: collectionStatus,
    upserted_points: points.length,
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
