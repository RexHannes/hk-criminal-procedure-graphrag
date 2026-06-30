const { exactJsonHeaders } = require("../api/json_content_type");
const { postOpenRouter } = require("./openrouter_client");
const {
  assertFreeOpenRouterModel,
  isOpenRouterFreeOnlyEnabled,
  isOpenRouterPaidAllowed,
} = require("./openrouter_free_only");
const { resolveOpenRouterRoleModel } = require("./openrouter_free_models");
const {
  assertProductionScaleRetrievalStack,
  isDevOnlyRerankProvider,
} = require("./runtime_isolation");

const SUPPORTED_RERANK_PROVIDERS = new Set(["none", "local", "cohere", "openrouter", "voyage"]);

function rerankProvider(env = process.env) {
  return String(env.LEGAL_RERANK_PROVIDER || env.RERANK_PROVIDER || "none").trim().toLowerCase();
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
    openrouter: "OPENROUTER_API_KEY",
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

function candidateText(candidate) {
  return [
    candidate.text,
    candidate.excerpt,
    candidate.proposition_text,
    candidate.supporting_quote,
    candidate.preview,
    candidate.source?.title,
    candidate.source?.neutral_citation,
    ...(candidate.issue_tags || []),
  ].filter(Boolean).join("\n");
}

async function postJson(url, { headers = {}, body } = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: exactJsonHeaders(headers),
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(`rerank_http_${response.status}`);
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function cohereRerank(query, candidates, { env, limit }) {
  const model = env.LEGAL_RERANK_MODEL || env.COHERE_RERANK_MODEL || "rerank-v3.5";
  const documents = (candidates || []).map(candidateText);
  const payload = await postJson("https://api.cohere.com/v2/rerank", {
    headers: { Authorization: `Bearer ${env.COHERE_API_KEY}` },
    body: {
      model,
      query,
      documents,
      top_n: Math.min(limit, documents.length),
    },
  });
  const results = (payload.results || []).map(item => ({
    ...(candidates[item.index] || {}),
    rerank_score: Number(item.relevance_score || 0),
    rerank_provider: "cohere",
    rerank_model: model,
  }));
  return { provider: "cohere", status: "configured", model, results };
}

async function voyageRerank(query, candidates, { env, limit }) {
  const model = env.LEGAL_RERANK_MODEL || env.VOYAGE_RERANK_MODEL || "rerank-2";
  const documents = (candidates || []).map(candidateText);
  const payload = await postJson("https://api.voyageai.com/v1/rerank", {
    headers: { Authorization: `Bearer ${env.VOYAGE_API_KEY}` },
    body: {
      model,
      query,
      documents,
      top_k: Math.min(limit, documents.length),
    },
  });
  const results = (payload.data || []).map(item => ({
    ...(candidates[item.index] || {}),
    rerank_score: Number(item.relevance_score || 0),
    rerank_provider: "voyage",
    rerank_model: model,
  }));
  return { provider: "voyage", status: "configured", model, results };
}

async function openRouterRerank(query, candidates, { env, limit }) {
  const model = resolveOpenRouterRoleModel(env, "rerank");
  assertFreeOpenRouterModel(model, env, { context: "rerank" });
  const documents = (candidates || []).map(candidateText);
  const payload = await postOpenRouter("/rerank", {
    env,
    body: {
      model,
      query,
      documents,
      top_n: Math.min(limit, documents.length),
    },
  });
  const rows = payload.results || payload.data || [];
  const results = rows.map(item => ({
    ...(candidates[item.index] || {}),
    rerank_score: Number(item.relevance_score || item.score || 0),
    rerank_provider: "openrouter",
    rerank_model: model,
  }));
  return { provider: "openrouter", status: "configured", model, results };
}

async function rerank(query, candidates, { env = process.env, limit = 10, allowDevRerank = true } = {}) {
  assertProductionScaleRetrievalStack(env, "rerank");
  const config = assertRerankConfig(env);
  if (!allowDevRerank && isDevOnlyRerankProvider(config.provider)) {
    throw new Error(`dev_rerank_blocked:${config.provider}`);
  }
  if (config.provider === "none") {
    return { provider: "none", status: config.status, results: (candidates || []).slice(0, limit) };
  }
  if (config.provider === "local") {
    return { provider: "local", status: config.status, results: localRerank(query, candidates, { limit }) };
  }
  if (config.provider === "cohere") return cohereRerank(query, candidates, { env, limit });
  if (config.provider === "openrouter") {
    if (isOpenRouterFreeOnlyEnabled(env) && !isOpenRouterPaidAllowed(env)) {
      const model = resolveOpenRouterRoleModel(env, "rerank");
      if (!model) {
        throw new Error("openrouter_free_rerank_blocked:use_local_or_none_rerank_provider");
      }
    }
    return openRouterRerank(query, candidates, { env, limit });
  }
  if (config.provider === "voyage") return voyageRerank(query, candidates, { env, limit });
  throw new Error(`unsupported_rerank_provider:${config.provider}`);
}

module.exports = {
  SUPPORTED_RERANK_PROVIDERS,
  assertRerankConfig,
  candidateText,
  localRerank,
  postJson,
  rerank,
  rerankProvider,
};
