// Curated free OpenRouter stack (June 2026 rankings: openrouter.ai/collections/free-models)
// Chat: Owl Alpha — highest free usage, Legal category, 1M context, agentic/tool use.
// Embeddings: NVIDIA Llama Nemotron Embed VL 1B V2 (free) — top free embedding model.
// Rerank: NVIDIA Llama Nemotron Rerank VL 1B V2 (free) — top free cross-encoder reranker.

const OPENROUTER_FREE_CHAT_MODEL = "openrouter/owl-alpha";
const OPENROUTER_FREE_EMBEDDING_MODEL = "nvidia/llama-nemotron-embed-vl-1b-v2:free";
const OPENROUTER_FREE_RERANK_MODEL = "nvidia/llama-nemotron-rerank-vl-1b-v2:free";
const OPENROUTER_FREE_EMBEDDING_DIM = 2048;

const CURATED_FREE_OPENROUTER_MODELS = new Set([
  "openrouter/free",
  OPENROUTER_FREE_CHAT_MODEL,
  OPENROUTER_FREE_EMBEDDING_MODEL,
  OPENROUTER_FREE_RERANK_MODEL,
  "nvidia/nemotron-3-ultra:free",
  "nvidia/nemotron-3-super:free",
  "openai/gpt-oss-120b:free",
]);

function isCuratedFreeOpenRouterModel(model) {
  const normalized = String(model || "").trim();
  if (!normalized) return false;
  if (CURATED_FREE_OPENROUTER_MODELS.has(normalized)) return true;
  if (normalized.toLowerCase() === "openrouter/free") return true;
  return /:free$/i.test(normalized);
}

function defaultFreeOpenRouterChatModel() {
  return OPENROUTER_FREE_CHAT_MODEL;
}

function defaultFreeOpenRouterEmbeddingModel() {
  return OPENROUTER_FREE_EMBEDDING_MODEL;
}

function defaultFreeOpenRouterRerankModel() {
  return OPENROUTER_FREE_RERANK_MODEL;
}

function defaultFreeOpenRouterEmbeddingDim() {
  return OPENROUTER_FREE_EMBEDDING_DIM;
}

function resolveOpenRouterRoleModel(env = process.env, role = "chat") {
  const roleKeys = {
    chat: ["OPENROUTER_MODEL"],
    embedding: ["LEGAL_EMBEDDING_MODEL", "OPENROUTER_EMBEDDING_MODEL"],
    rerank: ["LEGAL_RERANK_MODEL", "OPENROUTER_RERANK_MODEL"],
  };
  const roleDefaults = {
    chat: defaultFreeOpenRouterChatModel,
    embedding: defaultFreeOpenRouterEmbeddingModel,
    rerank: defaultFreeOpenRouterRerankModel,
  };
  for (const key of roleKeys[role] || roleKeys.chat) {
    const value = String(env[key] || "").trim();
    if (value) return value;
  }
  return roleDefaults[role] ? roleDefaults[role]() : "";
}

module.exports = {
  CURATED_FREE_OPENROUTER_MODELS,
  OPENROUTER_FREE_CHAT_MODEL,
  OPENROUTER_FREE_EMBEDDING_DIM,
  OPENROUTER_FREE_EMBEDDING_MODEL,
  OPENROUTER_FREE_RERANK_MODEL,
  defaultFreeOpenRouterChatModel,
  defaultFreeOpenRouterEmbeddingDim,
  defaultFreeOpenRouterEmbeddingModel,
  defaultFreeOpenRouterRerankModel,
  isCuratedFreeOpenRouterModel,
  resolveOpenRouterRoleModel,
};
