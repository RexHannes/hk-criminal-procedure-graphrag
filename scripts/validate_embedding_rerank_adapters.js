#!/usr/bin/env node
/* eslint-disable no-console */

const { assertEmbeddingConfig, embedText } = require("../src/retrieval/embedding_adapter");
const { assertRerankConfig, rerank } = require("../src/retrieval/rerank_adapter");
const fs = require("fs");
const path = require("path");

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

(async () => {
  const errors = [];
  const noneEnv = { EMBEDDING_PROVIDER: "none", RERANK_PROVIDER: "none" };
  assert(assertEmbeddingConfig(noneEnv).status === "disabled_fixture_vectors_only", "embedding none should be fixture-only", errors);
  assert(assertRerankConfig(noneEnv).status === "disabled_local_ordering_only", "rerank none should be disabled", errors);
  assert(assertEmbeddingConfig({ LEGAL_EMBEDDING_PROVIDER: "local-hash" }).status === "deterministic_local_test_vectors", "legal local-hash embedding should be deterministic", errors);
  const embedded = await embedText("abuse of process", { env: noneEnv, dimension: 12 });
  assert(embedded.vector.length === 12, "fixture embedding dimension mismatch", errors);
  const rankedNone = await rerank("abuse", [{ id: "a" }], { env: noneEnv });
  assert(rankedNone.provider === "none", "rerank provider none expected", errors);
  const rankedLocal = await rerank("abuse", [{ id: "a", text: "abuse" }, { id: "b", text: "bail" }], { env: { RERANK_PROVIDER: "local" } });
  assert(rankedLocal.results[0].id === "a", "local rerank should rank lexical match first", errors);
  try {
    assertEmbeddingConfig({ EMBEDDING_PROVIDER: "openai" });
    errors.push("openai embedding without key should fail closed");
  } catch (error) {
    assert(error.message.includes("missing_embedding_key"), "openai missing key error expected", errors);
  }
  try {
    assertRerankConfig({ RERANK_PROVIDER: "cohere" });
    errors.push("cohere rerank without key should fail closed");
  } catch (error) {
    assert(error.message.includes("missing_rerank_key"), "cohere missing key error expected", errors);
  }
  try {
    assertEmbeddingConfig({ EMBEDDING_PROVIDER: "openrouter", LEGAL_EMBEDDING_MODEL: "some/model:free" });
    errors.push("openrouter embedding without key should fail closed");
  } catch (error) {
    assert(error.message.includes("missing_embedding_key"), "openrouter embedding missing key error expected", errors);
  }
  try {
    assertRerankConfig({ RERANK_PROVIDER: "openrouter", LEGAL_RERANK_MODEL: "some/rerank:free" });
    errors.push("openrouter rerank without key should fail closed");
  } catch (error) {
    assert(error.message.includes("missing_rerank_key"), "openrouter rerank missing key error expected", errors);
  }
  try {
    assertEmbeddingConfig({ EMBEDDING_PROVIDER: "openrouter", OPENROUTER_API_KEY: "test", LEGAL_EMBEDDING_MODEL: "openai/text-embedding-3-small" });
    errors.push("openrouter non-free embedding should fail closed");
  } catch (error) {
    assert(error.message.includes("openrouter_free_embedding_model_required"), "openrouter free embedding guard expected", errors);
  }
  try {
    assertRerankConfig({ RERANK_PROVIDER: "openrouter", OPENROUTER_API_KEY: "test", LEGAL_RERANK_MODEL: "cohere/rerank-v3.5" });
    errors.push("openrouter non-free rerank should fail closed");
  } catch (error) {
    assert(error.message.includes("openrouter_free_rerank_model_required"), "openrouter free rerank guard expected", errors);
  }
  assert(assertEmbeddingConfig({ EMBEDDING_PROVIDER: "openai", OPENAI_API_KEY: "test" }).key_name === "OPENAI_API_KEY", "openai embedding key config expected", errors);
  assert(assertEmbeddingConfig({ EMBEDDING_PROVIDER: "voyage", VOYAGE_API_KEY: "test" }).key_name === "VOYAGE_API_KEY", "voyage embedding key config expected", errors);
  assert(assertEmbeddingConfig({ EMBEDDING_PROVIDER: "cohere", COHERE_API_KEY: "test" }).key_name === "COHERE_API_KEY", "cohere embedding key config expected", errors);
  assert(assertEmbeddingConfig({ EMBEDDING_PROVIDER: "openrouter", OPENROUTER_API_KEY: "test", LEGAL_EMBEDDING_MODEL: "provider/model:free" }).key_name === "OPENROUTER_API_KEY", "openrouter embedding key config expected", errors);
  assert(assertRerankConfig({ RERANK_PROVIDER: "cohere", COHERE_API_KEY: "test" }).key_name === "COHERE_API_KEY", "cohere rerank key config expected", errors);
  assert(assertRerankConfig({ RERANK_PROVIDER: "voyage", VOYAGE_API_KEY: "test" }).key_name === "VOYAGE_API_KEY", "voyage rerank key config expected", errors);
  assert(assertRerankConfig({ RERANK_PROVIDER: "openrouter", OPENROUTER_API_KEY: "test", LEGAL_RERANK_MODEL: "provider/rerank:free" }).key_name === "OPENROUTER_API_KEY", "openrouter rerank key config expected", errors);
  const root = path.resolve(__dirname, "..");
  const bailIndexer = fs.readFileSync(path.join(root, "scripts", "index_public_bail_batch_qdrant.js"), "utf8");
  const qdrantRetriever = fs.readFileSync(path.join(root, "src", "legal_answer", "qdrant_retriever.js"), "utf8");
  assert(bailIndexer.includes("embeddingModelFor"), "bail Qdrant indexer should resolve provider-specific embedding model names", errors);
  assert(bailIndexer.includes("actualDimension"), "bail Qdrant indexer should use actual provider vector dimensions", errors);
  assert(bailIndexer.includes("Embedding dimension drift"), "bail Qdrant indexer should fail on dimension drift", errors);
  assert(qdrantRetriever.includes("actualDimension"), "Qdrant retriever should report actual query vector dimension", errors);
  if (errors.length) {
    console.error("Embedding/rerank adapter validation failed:");
    errors.forEach(error => console.error(`- ${error}`));
    process.exit(1);
  }
  console.log("Embedding adapter validation passed.");
  console.log("Rerank adapter validation passed.");
})().catch(error => {
  console.error(error.message);
  process.exit(1);
});
