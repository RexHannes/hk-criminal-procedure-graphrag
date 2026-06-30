const PRODUCTION_RUNTIME_MODE = "production_scale";
const DEVELOPMENT_RUNTIME_MODE = "development";

const DEV_EMBEDDING_PROVIDERS = new Set(["", "none", "local", "local-hash"]);
const DEV_RERANK_PROVIDERS = new Set(["", "none", "local"]);

function runtimeMode(env = process.env) {
  const mode = String(env.LEGAL_RUNTIME_MODE || DEVELOPMENT_RUNTIME_MODE).trim().toLowerCase();
  return mode === PRODUCTION_RUNTIME_MODE ? PRODUCTION_RUNTIME_MODE : DEVELOPMENT_RUNTIME_MODE;
}

function isProductionScaleMode(env = process.env) {
  return runtimeMode(env) === PRODUCTION_RUNTIME_MODE;
}

function resolvedEmbeddingProvider(env = process.env) {
  return String(env.LEGAL_EMBEDDING_PROVIDER || env.EMBEDDING_PROVIDER || "local-hash").trim().toLowerCase();
}

function resolvedRerankProvider(env = process.env) {
  return String(env.LEGAL_RERANK_PROVIDER || env.RERANK_PROVIDER || "none").trim().toLowerCase();
}

function isDevOnlyEmbeddingProvider(provider) {
  return DEV_EMBEDDING_PROVIDERS.has(String(provider || "").trim().toLowerCase());
}

function isDevOnlyRerankProvider(provider) {
  return DEV_RERANK_PROVIDERS.has(String(provider || "").trim().toLowerCase());
}

function isDurableOrchestrationReady(env = process.env) {
  const hasEvent = Boolean(env.INNGEST_EVENT_KEY);
  const hasSigning = Boolean(env.INNGEST_SIGNING_KEY);
  const hasDev = Boolean(env.INNGEST_DEV);
  return (hasEvent && hasSigning) || hasDev;
}

function embeddingVectorSpaceId(env = process.env) {
  const provider = resolvedEmbeddingProvider(env);
  const model = String(env.LEGAL_EMBEDDING_MODEL || env.EMBEDDING_MODEL || "").trim();
  const dim = String(env.LEGAL_EMBEDDING_DIM || "").trim();
  if (isDevOnlyEmbeddingProvider(provider)) {
    return `dev:${provider}:${dim || "384"}`;
  }
  return `prod:${provider}:${model}:${dim}`;
}

function vectorNamespaceSuffix(env = process.env) {
  if (isProductionScaleMode(env)) return "_prod";
  if (isDevOnlyEmbeddingProvider(resolvedEmbeddingProvider(env))) return "_dev_localhash";
  return "_dev_real";
}

function resolveQdrantCollection(baseName, env = process.env, explicitEnvKey = "") {
  const explicit = explicitEnvKey ? String(env[explicitEnvKey] || "").trim() : "";
  const autoNamespace = String(env.LEGAL_QDRANT_NAMESPACE_AUTO || "true").trim().toLowerCase() !== "false";
  const collection = explicit || (autoNamespace ? `${baseName}${vectorNamespaceSuffix(env)}` : baseName);
  assertCollectionMatchesRuntime(env, collection);
  return collection;
}

function assertCollectionMatchesRuntime(env = process.env, collectionName = "") {
  const name = String(collectionName || "");
  if (!name) return;
  const provider = resolvedEmbeddingProvider(env);
  if (isProductionScaleMode(env)) {
    if (name.includes("_dev")) {
      throw new Error(`production_scale_blocks_dev_collection:${name}`);
    }
    if (!name.includes("_prod") && String(env.LEGAL_QDRANT_NAMESPACE_AUTO || "true").toLowerCase() !== "false") {
      throw new Error(`production_scale_requires_prod_collection_suffix:${name}`);
    }
    return;
  }
  if (isDevOnlyEmbeddingProvider(provider) && name.includes("_prod")) {
    throw new Error(`dev_embedding_cannot_use_prod_collection:${name}`);
  }
  if (!isDevOnlyEmbeddingProvider(provider) && name.includes("_dev_localhash")) {
    throw new Error(`production_embedding_cannot_use_dev_localhash_collection:${name}`);
  }
}

function assertProductionScaleRetrievalStack(env = process.env, context = "retrieval") {
  if (!isProductionScaleMode(env)) {
    return {
      ok: true,
      mode: DEVELOPMENT_RUNTIME_MODE,
      embedding_provider: resolvedEmbeddingProvider(env),
      rerank_provider: resolvedRerankProvider(env),
    };
  }
  const blockers = [];
  const embedding = resolvedEmbeddingProvider(env);
  const rerank = resolvedRerankProvider(env);
  if (isDevOnlyEmbeddingProvider(embedding)) blockers.push(`dev_embedding_blocked:${embedding}`);
  if (isDevOnlyRerankProvider(rerank)) blockers.push(`dev_rerank_blocked:${rerank}`);
  if (!isDurableOrchestrationReady(env)) blockers.push("durable_orchestration_missing");
  if (blockers.length) {
    const error = new Error(`${context}:${blockers.join(",")}`);
    error.blockers = blockers;
    throw error;
  }
  return {
    ok: true,
    mode: PRODUCTION_RUNTIME_MODE,
    embedding_provider: embedding,
    rerank_provider: rerank,
    vector_space_id: embeddingVectorSpaceId(env),
  };
}

function assertScaleIndexAllowed(env = process.env, context = "index") {
  if (isProductionScaleMode(env)) return assertProductionScaleRetrievalStack(env, context);
  const collectionSuffix = vectorNamespaceSuffix(env);
  if (isDevOnlyEmbeddingProvider(resolvedEmbeddingProvider(env)) && collectionSuffix !== "_dev_localhash") {
    throw new Error(`${context}:dev_embedding_requires_dev_localhash_namespace`);
  }
  return {
    ok: true,
    mode: DEVELOPMENT_RUNTIME_MODE,
    vector_space_id: embeddingVectorSpaceId(env),
  };
}

function runtimeIsolationReport(env = process.env) {
  const embedding = resolvedEmbeddingProvider(env);
  const rerank = resolvedRerankProvider(env);
  const mode = runtimeMode(env);
  const blockers = [];
  if (mode === PRODUCTION_RUNTIME_MODE) {
    if (isDevOnlyEmbeddingProvider(embedding)) blockers.push("dev_embedding_in_production_scale");
    if (isDevOnlyRerankProvider(rerank)) blockers.push("dev_rerank_in_production_scale");
    if (!isDurableOrchestrationReady(env)) blockers.push("durable_orchestration_missing");
  }
  return {
    runtime_mode: mode,
    embedding_provider: embedding,
    rerank_provider: rerank,
    vector_space_id: embeddingVectorSpaceId(env),
    vector_namespace_suffix: vectorNamespaceSuffix(env),
    durable_orchestration_ready: isDurableOrchestrationReady(env),
    ok: blockers.length === 0,
    blockers,
  };
}

module.exports = {
  DEVELOPMENT_RUNTIME_MODE,
  DEV_EMBEDDING_PROVIDERS,
  DEV_RERANK_PROVIDERS,
  PRODUCTION_RUNTIME_MODE,
  assertCollectionMatchesRuntime,
  assertProductionScaleRetrievalStack,
  assertScaleIndexAllowed,
  embeddingVectorSpaceId,
  isDevOnlyEmbeddingProvider,
  isDevOnlyRerankProvider,
  isDurableOrchestrationReady,
  isProductionScaleMode,
  resolveQdrantCollection,
  resolvedEmbeddingProvider,
  resolvedRerankProvider,
  runtimeIsolationReport,
  runtimeMode,
  vectorNamespaceSuffix,
};
