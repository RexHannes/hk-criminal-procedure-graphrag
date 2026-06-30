const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { embedText } = require("../retrieval/embedding_adapter");
const {
  assertProductionScaleRetrievalStack,
  embeddingVectorSpaceId,
  resolveQdrantCollection,
  resolvedEmbeddingProvider,
} = require("../retrieval/runtime_isolation");
const { buildRetrievalScopeFilter } = require("../case_graph/scale_ingest_safeguards");

const ROOT = path.resolve(__dirname, "..", "..");

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

async function embed(text, env, dimension) {
  assertProductionScaleRetrievalStack(env, "qdrant_embed");
  const provider = resolvedEmbeddingProvider(env);
  const result = await embedText(text, {
    env: {
      ...env,
      LEGAL_EMBEDDING_PROVIDER: provider,
      EMBEDDING_PROVIDER: provider,
    },
    dimension,
  });
  return result.vector;
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

function matchValue(key, value) {
  return {
    key,
    match: { value },
  };
}

function publicDemoFilter() {
  return {
    must: [
      matchValue("source_visibility", "public_demo"),
      matchValue("tenant_id", "public"),
    ],
  };
}

function tenantRetrievalFilter({ tenantId, includePrivate = false, privateIngestionEnabled = false } = {}) {
  if (!includePrivate || !privateIngestionEnabled || !tenantId) return publicDemoFilter();
  return {
    should: [
      {
        must: [
          matchValue("source_visibility", "public_demo"),
          matchValue("tenant_id", "public"),
        ],
      },
      {
        must: [
          matchValue("source_visibility", "private_tenant"),
          matchValue("tenant_id", tenantId),
        ],
      },
    ],
  };
}

async function searchQdrant({
  query,
  collectionName,
  topK = 5,
  scoreThreshold = 0.01,
  env = loadEnv(),
  sourceMode = "public_demo",
  tenantId = "public",
  includePrivate = false,
} = {}) {
  const provider = resolvedEmbeddingProvider(env);
  const dimension = Number(env.LEGAL_EMBEDDING_DIM || (provider === "openai" ? 1536 : 384));
  const collection = collectionName || resolveQdrantCollection(
    "hk_proposition_cards",
    env,
    "QDRANT_COLLECTION_PROPOSITIONS",
  );
  const privateIngestionEnabled = String(env.PRIVATE_SOURCE_INGESTION_ENABLED || "false").toLowerCase() === "true";
  const filter = sourceMode === "private_tenant"
    ? tenantRetrievalFilter({ tenantId, includePrivate, privateIngestionEnabled })
    : buildRetrievalScopeFilter(env, {
      sourceMode,
      tenantId,
      includePrivate,
      privateIngestionEnabled,
    });
  const vector = await embed(query, env, dimension);
  const actualDimension = vector.length;
  const payload = await qdrantRequest(env, `/collections/${encodeURIComponent(collection)}/points/search`, {
    method: "POST",
    body: {
      vector,
      filter,
      limit: topK,
      with_payload: true,
      score_threshold: scoreThreshold,
    },
  });
  return {
    query,
    collection_name: collection,
    top_k: topK,
    returned_count: (payload.result || []).length,
    embedding_provider: provider,
    vector_space_id: embeddingVectorSpaceId(env),
    dimension: actualDimension,
    source_mode: sourceMode,
    tenant_id: sourceMode === "private_tenant" ? tenantId : "public",
    filter,
    hits: payload.result || [],
  };
}

module.exports = {
  buildRetrievalScopeFilter,
  embed,
  loadEnv,
  localHashEmbedding,
  publicDemoFilter,
  qdrantRequest,
  searchQdrant,
  tenantRetrievalFilter,
};
