const SUPPORTED_RERANK_PROVIDERS = new Set(["none", "local", "cohere", "voyage"]);

function rerankProvider(env = process.env) {
  return String(env.RERANK_PROVIDER || "none").trim().toLowerCase();
}

function assertRerankConfig(env = process.env) {
  const provider = rerankProvider(env);
  if (!SUPPORTED_RERANK_PROVIDERS.has(provider)) {
    throw new Error(`unsupported_rerank_provider:${provider}`);
  }
  if (provider === "none") return { provider, status: "disabled_local_ordering_only" };
  if (provider === "local") return { provider, status: "deterministic_local_rerank" };
  const keyMap = {
    cohere: "COHERE_API_KEY",
    voyage: "VOYAGE_API_KEY",
  };
  const keyName = keyMap[provider];
  if (!env[keyName]) throw new Error(`missing_rerank_key:${keyName}`);
  return { provider, status: "configured", key_name: keyName };
}

function localRerank(query, candidates, { limit = 10 } = {}) {
  const queryTerms = new Set(String(query || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  return (candidates || [])
    .map(candidate => {
      const text = JSON.stringify(candidate).toLowerCase();
      let score = 0;
      for (const term of queryTerms) {
        if (text.includes(term)) score += 1;
      }
      return { ...candidate, rerank_score: score, rerank_provider: "local" };
    })
    .sort((a, b) => b.rerank_score - a.rerank_score)
    .slice(0, limit);
}

async function rerank(query, candidates, { env = process.env, limit = 10 } = {}) {
  const config = assertRerankConfig(env);
  if (config.provider === "none") {
    return { provider: "none", status: config.status, results: (candidates || []).slice(0, limit) };
  }
  if (config.provider === "local") {
    return { provider: "local", status: config.status, results: localRerank(query, candidates, { limit }) };
  }
  throw new Error(`rerank_provider_interface_only:${config.provider}`);
}

module.exports = {
  SUPPORTED_RERANK_PROVIDERS,
  assertRerankConfig,
  localRerank,
  rerank,
  rerankProvider,
};
