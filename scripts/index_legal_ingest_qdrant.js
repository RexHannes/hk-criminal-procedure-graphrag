#!/usr/bin/env node
/* eslint-disable no-console */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const VERTICAL_PATH = path.join(ROOT, "data", "legal_ingest", "verticals", "inconsistent_pleadings.json");

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

function tokenize(text) {
  return String(text || "").toLowerCase().split(/[^a-z0-9\u4e00-\u9fff]+/).filter(Boolean);
}

function localHashEmbedding(text, dimension) {
  const vector = new Array(dimension).fill(0);
  for (const token of tokenize(text)) {
    const digest = crypto.createHash("sha256").update(token).digest();
    const idx = digest.readUInt32BE(0) % dimension;
    const sign = digest[4] % 2 === 0 ? 1 : -1;
    vector[idx] += sign * (1 + Math.log1p(token.length));
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map(value => Number((value / norm).toFixed(8)));
}

async function openAiEmbedding(text, env) {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY required for LEGAL_EMBEDDING_PROVIDER=openai");
  const model = env.LEGAL_EMBEDDING_MODEL || "text-embedding-3-small";
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, input: text }),
  });
  if (!response.ok) throw new Error(`OpenAI embedding HTTP ${response.status}`);
  const payload = await response.json();
  return payload.data?.[0]?.embedding || [];
}

async function embed(text, env, dimension) {
  const provider = env.LEGAL_EMBEDDING_PROVIDER || "local-hash";
  if (provider === "openai") return openAiEmbedding(text, env);
  if (provider === "local-hash") return localHashEmbedding(text, dimension);
  throw new Error(`Unsupported LEGAL_EMBEDDING_PROVIDER ${provider}`);
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
  await qdrantRequest(env, `/collections/${encodeURIComponent(collectionName)}`, {
    method: "PUT",
    body: {
      vectors: {
        size: dimension,
        distance: "Cosine",
      },
    },
    ok: [200, 201],
  });
}

function propositionPayload(card, sourceById, paragraphById) {
  const source = sourceById.get(card.source_id) || {};
  const paragraph = paragraphById.get(card.paragraph_id) || {};
  return {
    source_id: card.source_id,
    source_type: source.source_type || "case",
    jurisdiction: card.jurisdiction || "Hong Kong",
    practice_area: "civil_litigation",
    issue_tags: card.issue_tags || [],
    court_level: source.court || paragraph.court || "",
    authority_role: card.authority_role || "secondary_check_required",
    review_status: card.review_status || "unreviewed",
    answer_layer_status: card.answer_layer_status || "research_only",
    visibility: source.visibility || paragraph.visibility || "public_source",
    firm_id: null,
    proposition_id: card.proposition_id,
    paragraph_id: card.paragraph_id,
    citation: card.citation,
    pinpoint: card.pinpoint,
    title: source.title,
    supporting_quote: card.supporting_quote,
  };
}

function paragraphPayload(paragraph, sourceById) {
  const source = sourceById.get(paragraph.source_id) || {};
  return {
    source_id: paragraph.source_id,
    source_type: source.source_type || "case",
    jurisdiction: paragraph.jurisdiction || "Hong Kong",
    practice_area: "civil_litigation",
    issue_tags: paragraph.issue_tags || [],
    court_level: source.court || paragraph.court || "",
    authority_role: "paragraph_text",
    review_status: source.review_status || "lawyer_review_required",
    answer_layer_status: paragraph.answer_layer_status || "research_only",
    visibility: paragraph.visibility || source.visibility || "public_source",
    firm_id: null,
    paragraph_id: paragraph.paragraph_id,
    citation: paragraph.citation,
    pinpoint: paragraph.pinpoint,
    title: source.title,
  };
}

function formPayload(form) {
  return {
    source_id: form.form_id,
    source_type: "form_metadata",
    jurisdiction: "Hong Kong",
    practice_area: "civil_litigation",
    issue_tags: form.linked_issues || [],
    court_level: "",
    authority_role: "form_metadata",
    review_status: form.review_status || "machine_extracted_candidate",
    answer_layer_status: "research_only",
    visibility: "public_metadata",
    firm_id: null,
    form_id: form.form_id,
    form_family: form.form_family,
    document_type: form.document_type,
    title: form.title,
    trigger_conditions: form.trigger_conditions || [],
    required_facts: form.required_facts || [],
    output_mode: form.output_mode,
  };
}

async function upsertPoints(env, collectionName, points) {
  if (!points.length) return;
  await qdrantRequest(env, `/collections/${encodeURIComponent(collectionName)}/points?wait=true`, {
    method: "PUT",
    body: { points },
  });
}

async function buildPoints(records, textFn, payloadFn, env, dimension) {
  const points = [];
  for (const record of records) {
    const text = textFn(record);
    points.push({
      id: uuidFromText(`${record.proposition_id || record.paragraph_id || record.form_id}:${text}`),
      vector: await embed(text, env, dimension),
      payload: {
        ...payloadFn(record),
        indexed_text_preview: text.slice(0, 500),
      },
    });
  }
  return points;
}

async function main() {
  const env = loadEnv();
  const dryRun = process.argv.includes("--dry-run");
  const vertical = readJson(VERTICAL_PATH);
  const provider = env.LEGAL_EMBEDDING_PROVIDER || "local-hash";
  const dimension = Number(env.LEGAL_EMBEDDING_DIM || (provider === "openai" ? 1536 : 384));
  const collections = {
    paragraphs: env.QDRANT_COLLECTION_PARAGRAPHS || "hk_legal_paragraphs",
    propositions: env.QDRANT_COLLECTION_PROPOSITIONS || "hk_proposition_cards",
    forms: env.QDRANT_COLLECTION_FORMS || "hk_form_metadata",
  };
  const sourceById = new Map((vertical.source_registry || []).map(source => [source.source_id, source]));
  const paragraphById = new Map((vertical.legal_paragraphs || []).map(paragraph => [paragraph.paragraph_id, paragraph]));
  const propositionPoints = await buildPoints(
    vertical.proposition_cards || [],
    card => `${card.proposition_text}\n${card.supporting_quote}\n${(card.issue_tags || []).join(" ")}`,
    card => propositionPayload(card, sourceById, paragraphById),
    env,
    dimension,
  );
  const paragraphPoints = await buildPoints(
    vertical.legal_paragraphs || [],
    paragraph => `${paragraph.citation || ""} ${paragraph.pinpoint || ""}\n${paragraph.paragraph_text || ""}\n${(paragraph.issue_tags || []).join(" ")}`,
    paragraph => paragraphPayload(paragraph, sourceById),
    env,
    dimension,
  );
  const formPoints = await buildPoints(
    vertical.form_metadata || [],
    form => `${form.title}\n${(form.trigger_conditions || []).join(" ")}\n${(form.required_facts || []).join(" ")}\n${(form.linked_issues || []).join(" ")}`,
    formPayload,
    env,
    dimension,
  );
  const report = {
    indexer: "legal_ingest_qdrant_v1",
    vertical_id: vertical.vertical_id,
    dry_run: dryRun,
    qdrant_configured: Boolean(env.QDRANT_URL),
    embedding_provider: provider,
    embedding_model: env.LEGAL_EMBEDDING_MODEL || (provider === "openai" ? "text-embedding-3-small" : "local-hash"),
    dimension,
    collections,
    point_counts: {
      paragraphs: paragraphPoints.length,
      propositions: propositionPoints.length,
      forms: formPoints.length,
    },
  };
  if (!env.QDRANT_URL || dryRun) {
    report.status = env.QDRANT_URL ? "dry_run_ready" : "skipped_missing_qdrant_url";
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  await ensureCollection(env, collections.paragraphs, dimension);
  await ensureCollection(env, collections.propositions, dimension);
  await ensureCollection(env, collections.forms, dimension);
  await upsertPoints(env, collections.paragraphs, paragraphPoints);
  await upsertPoints(env, collections.propositions, propositionPoints);
  await upsertPoints(env, collections.forms, formPoints);
  report.status = "indexed";
  console.log(JSON.stringify(report, null, 2));
}

main().catch(error => {
  console.error(error.message);
  if (error.payload) console.error(JSON.stringify(error.payload, null, 2));
  process.exit(1);
});
