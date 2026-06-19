#!/usr/bin/env node
/* eslint-disable no-console */

const { assertEmbeddingConfig, embedText } = require("../src/retrieval/embedding_adapter");
const { assertRerankConfig, rerank } = require("../src/retrieval/rerank_adapter");

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

(async () => {
  const errors = [];
  const noneEnv = { EMBEDDING_PROVIDER: "none", RERANK_PROVIDER: "none" };
  assert(assertEmbeddingConfig(noneEnv).status === "disabled_fixture_vectors_only", "embedding none should be fixture-only", errors);
  assert(assertRerankConfig(noneEnv).status === "disabled_local_ordering_only", "rerank none should be disabled", errors);
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
