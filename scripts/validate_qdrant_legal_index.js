#!/usr/bin/env node
/* Validate Qdrant collections for the legal-ingest pilot vertical. */

const fs = require("fs");
const path = require("path");

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

async function qdrantGet(env, pathAndQuery) {
  const base = String(env.QDRANT_URL || "").replace(/\/$/, "");
  if (!base) throw new Error("QDRANT_URL missing");
  const headers = {};
  if (env.QDRANT_API_KEY) headers["api-key"] = env.QDRANT_API_KEY;
  const response = await fetch(`${base}${pathAndQuery}`, { headers });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const err = new Error(`Qdrant HTTP ${response.status} ${pathAndQuery}`);
    err.payload = payload;
    throw err;
  }
  return payload;
}

async function collectionInfo(env, name) {
  const payload = await qdrantGet(env, `/collections/${encodeURIComponent(name)}`);
  const result = payload.result || {};
  return {
    name,
    points_count: result.points_count || 0,
    vector_size: result.config?.params?.vectors?.size,
    distance: result.config?.params?.vectors?.distance,
    status: result.status,
  };
}

async function main() {
  const env = loadEnv();
  const minPoints = Number(process.env.MIN_QDRANT_POINTS || 1);
  const expectedDimension = Number(env.LEGAL_EMBEDDING_DIM || 384);
  const collections = [
    env.QDRANT_COLLECTION_PARAGRAPHS || "hk_legal_paragraphs",
    env.QDRANT_COLLECTION_PROPOSITIONS || "hk_proposition_cards",
    env.QDRANT_COLLECTION_FORMS || "hk_form_metadata",
  ];
  const errors = [];
  const infos = [];
  for (const name of collections) {
    try {
      const info = await collectionInfo(env, name);
      infos.push(info);
      if (info.points_count < minPoints) errors.push(`${name} has only ${info.points_count} points`);
      if (info.vector_size !== expectedDimension) errors.push(`${name} vector size ${info.vector_size} != ${expectedDimension}`);
      if (info.distance !== "Cosine") errors.push(`${name} distance ${info.distance} != Cosine`);
    } catch (error) {
      errors.push(`${name}: ${error.message}`);
    }
  }
  const report = {
    qdrant_url_present: Boolean(env.QDRANT_URL),
    embedding_provider: env.LEGAL_EMBEDDING_PROVIDER || "local-hash",
    expected_dimension: expectedDimension,
    collections: infos,
    status: errors.length ? "failed" : "passed",
    errors,
  };
  console.log(JSON.stringify(report, null, 2));
  if (errors.length) process.exit(1);
}

main().catch(error => {
  console.error(error.message);
  if (error.payload) console.error(JSON.stringify(error.payload, null, 2));
  process.exit(1);
});
