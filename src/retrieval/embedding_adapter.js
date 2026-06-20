const crypto = require("crypto");

const SUPPORTED_EMBEDDING_PROVIDERS = new Set(["none", "local", "local-hash", "openai", "voyage", "cohere"]);

function embeddingProvider(env = process.env) {
  return String(env.LEGAL_EMBEDDING_PROVIDER || env.EMBEDDING_PROVIDER || "none").trim().toLowerCase();
}

function assertEmbeddingConfig(env = process.env) {
  const provider = embeddingProvider(env);
  if (!SUPPORTED_EMBEDDING_PROVIDERS.has(provider)) {
    throw new Error(`unsupported_embedding_provider:${provider}`);
  }
  if (provider === "none") return { provider, status: "disabled_fixture_vectors_only" };
  if (provider === "local" || provider === "local-hash") return { provider, status: "deterministic_local_test_vectors" };
  const keyMap = {
    openai: "OPENAI_API_KEY",
    voyage: "VOYAGE_API_KEY",
    cohere: "COHERE_API_KEY",
  };
  const keyName = keyMap[provider];
  if (!env[keyName]) throw new Error(`missing_embedding_key:${keyName}`);
  return { provider, status: "configured", key_name: keyName };
}

function tokenize(text) {
  return String(text || "").toLowerCase().split(/[^a-z0-9\u4e00-\u9fff]+/).filter(Boolean);
}

function deterministicVector(text, dimension = 384) {
  const vector = new Array(dimension).fill(0);
  for (const token of tokenize(text)) {
    const digest = crypto.createHash("sha256").update(token).digest();
    const idx = digest.readUInt32BE(0) % dimension;
    vector[idx] += digest[4] % 2 === 0 ? 1 : -1;
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map(value => Number((value / norm).toFixed(8)));
}

async function postJson(url, { headers = {}, body } = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(`embedding_http_${response.status}`);
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function openAiEmbedding(text, env) {
  const model = env.LEGAL_EMBEDDING_MODEL || env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
  const body = { model, input: text };
  if (env.LEGAL_EMBEDDING_DIM && model.startsWith("text-embedding-3")) {
    body.dimensions = Number(env.LEGAL_EMBEDDING_DIM);
  }
  const payload = await postJson("https://api.openai.com/v1/embeddings", {
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body,
  });
  const vector = payload.data?.[0]?.embedding;
  if (!Array.isArray(vector)) throw new Error("openai_embedding_missing_vector");
  return { provider: "openai", status: "configured", model, vector, dimension: vector.length };
}

async function voyageEmbedding(text, env) {
  const model = env.LEGAL_EMBEDDING_MODEL || env.VOYAGE_EMBEDDING_MODEL || "voyage-3-large";
  const payload = await postJson("https://api.voyageai.com/v1/embeddings", {
    headers: { Authorization: `Bearer ${env.VOYAGE_API_KEY}` },
    body: { model, input: [text] },
  });
  const vector = payload.data?.[0]?.embedding;
  if (!Array.isArray(vector)) throw new Error("voyage_embedding_missing_vector");
  return { provider: "voyage", status: "configured", model, vector, dimension: vector.length };
}

async function cohereEmbedding(text, env) {
  const model = env.LEGAL_EMBEDDING_MODEL || env.COHERE_EMBEDDING_MODEL || "embed-v4.0";
  const payload = await postJson("https://api.cohere.com/v2/embed", {
    headers: { Authorization: `Bearer ${env.COHERE_API_KEY}` },
    body: {
      model,
      texts: [text],
      input_type: env.COHERE_EMBED_INPUT_TYPE || "search_document",
      embedding_types: ["float"],
    },
  });
  const vector = payload.embeddings?.float?.[0] || payload.embeddings?.[0];
  if (!Array.isArray(vector)) throw new Error("cohere_embedding_missing_vector");
  return { provider: "cohere", status: "configured", model, vector, dimension: vector.length };
}

async function embedText(text, { env = process.env, dimension = 384 } = {}) {
  const config = assertEmbeddingConfig(env);
  if (config.provider === "none" || config.provider === "local" || config.provider === "local-hash") {
    return {
      provider: config.provider,
      status: config.status,
      vector: deterministicVector(text, dimension),
      dimension,
    };
  }
  if (config.provider === "openai") return openAiEmbedding(text, env);
  if (config.provider === "voyage") return voyageEmbedding(text, env);
  if (config.provider === "cohere") return cohereEmbedding(text, env);
  throw new Error(`unsupported_embedding_provider:${config.provider}`);
}

module.exports = {
  SUPPORTED_EMBEDDING_PROVIDERS,
  assertEmbeddingConfig,
  deterministicVector,
  embedText,
  embeddingProvider,
  postJson,
};
