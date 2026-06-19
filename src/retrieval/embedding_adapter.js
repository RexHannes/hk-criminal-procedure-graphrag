const crypto = require("crypto");

const SUPPORTED_EMBEDDING_PROVIDERS = new Set(["none", "local", "openai", "voyage", "cohere"]);

function embeddingProvider(env = process.env) {
  return String(env.EMBEDDING_PROVIDER || "none").trim().toLowerCase();
}

function assertEmbeddingConfig(env = process.env) {
  const provider = embeddingProvider(env);
  if (!SUPPORTED_EMBEDDING_PROVIDERS.has(provider)) {
    throw new Error(`unsupported_embedding_provider:${provider}`);
  }
  if (provider === "none") return { provider, status: "disabled_fixture_vectors_only" };
  if (provider === "local") return { provider, status: "deterministic_local_test_vectors" };
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

async function embedText(text, { env = process.env, dimension = 384 } = {}) {
  const config = assertEmbeddingConfig(env);
  if (config.provider === "none" || config.provider === "local") {
    return {
      provider: config.provider,
      status: config.status,
      vector: deterministicVector(text, dimension),
      dimension,
    };
  }
  throw new Error(`embedding_provider_interface_only:${config.provider}`);
}

module.exports = {
  SUPPORTED_EMBEDDING_PROVIDERS,
  assertEmbeddingConfig,
  deterministicVector,
  embedText,
  embeddingProvider,
};
