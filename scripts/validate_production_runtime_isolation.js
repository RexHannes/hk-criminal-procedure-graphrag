#!/usr/bin/env node
/* eslint-disable no-console */

const { embedText } = require("../src/retrieval/embedding_adapter");
const { rerank } = require("../src/retrieval/rerank_adapter");
const {
  PRODUCTION_RUNTIME_MODE,
  assertCollectionMatchesRuntime,
  assertProductionScaleRetrievalStack,
  resolveQdrantCollection,
  runtimeIsolationReport,
} = require("../src/retrieval/runtime_isolation");
const { dispatchCaseScaleShard, enqueueCaseScaleShard } = require("../src/orchestration/durable_jobs");

const errors = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

(async () => {
  const devEnv = { LEGAL_RUNTIME_MODE: "development", LEGAL_EMBEDDING_PROVIDER: "local-hash", LEGAL_RERANK_PROVIDER: "none" };
  const devReport = runtimeIsolationReport(devEnv);
  assert(devReport.runtime_mode === "development", "development runtime mode expected");
  assert(devReport.ok, "development local-hash stack should be isolated but allowed");
  assert(resolveQdrantCollection("hk_proposition_cards", devEnv, "QDRANT_COLLECTION_PROPOSITIONS").endsWith("_dev_localhash"), "dev collection suffix expected");

  const prodEnv = {
    LEGAL_RUNTIME_MODE: PRODUCTION_RUNTIME_MODE,
    LEGAL_EMBEDDING_PROVIDER: "local-hash",
    LEGAL_RERANK_PROVIDER: "none",
    INNGEST_DEV: "1",
  };
  const prodReport = runtimeIsolationReport(prodEnv);
  assert(!prodReport.ok, "production_scale with local-hash should fail isolation");
  assert(prodReport.blockers.includes("dev_embedding_in_production_scale"), "dev embedding blocker expected");

  try {
    assertProductionScaleRetrievalStack(prodEnv, "test");
    errors.push("production_scale local-hash should throw");
  } catch (error) {
    assert(error.message.includes("dev_embedding_blocked"), "production scale embedding block expected");
  }

  const readyProdEnv = {
    LEGAL_RUNTIME_MODE: PRODUCTION_RUNTIME_MODE,
    LEGAL_EMBEDDING_PROVIDER: "voyage",
    LEGAL_EMBEDDING_MODEL: "voyage-3-large",
    LEGAL_EMBEDDING_DIM: "1024",
    VOYAGE_API_KEY: "test",
    LEGAL_RERANK_PROVIDER: "cohere",
    LEGAL_RERANK_MODEL: "rerank-v3.5",
    COHERE_API_KEY: "test",
    INNGEST_EVENT_KEY: "test",
    INNGEST_SIGNING_KEY: "test",
  };
  const readyReport = runtimeIsolationReport(readyProdEnv);
  assert(readyReport.ok, "configured production stack should pass isolation");
  const prodCollection = resolveQdrantCollection("hk_proposition_cards", readyProdEnv, "QDRANT_COLLECTION_PROPOSITIONS");
  assert(prodCollection.endsWith("_prod"), "production collection suffix expected");

  try {
    assertCollectionMatchesRuntime(readyProdEnv, "hk_proposition_cards_dev_localhash");
    errors.push("prod runtime should reject dev collection");
  } catch (error) {
    assert(error.message.includes("production_scale_blocks_dev_collection"), "prod/dev collection mix block expected");
  }

  try {
    await embedText("bail application", { env: prodEnv, dimension: 12 });
    errors.push("embedText should block in production_scale with local-hash");
  } catch (error) {
    assert(error.message.includes("dev_embedding_blocked"), "embedText production block expected");
  }

  try {
    await rerank("bail", [{ text: "bail application" }], { env: prodEnv });
    errors.push("rerank should block in production_scale with none rerank");
  } catch (error) {
    assert(error.message.includes("dev_rerank_blocked"), "rerank production block expected");
  }

  const manifest = enqueueCaseScaleShard({
    plan: { run_plan_id: "test_plan", target_cases: 10000, scope: "criminal_domain_public_cases" },
    shard: { shard_id: "shard_0001", case_ordinal_start: 1, case_ordinal_end: 100, max_cases: 100 },
    env: readyProdEnv,
  });
  assert(manifest.job_id.startsWith("case_scale_"), "job manifest id expected");
  assert(manifest.checksum, "job checksum expected");

  const dispatched = await dispatchCaseScaleShard({
    plan: { run_plan_id: "test_plan_dispatch", target_cases: 10000, scope: "criminal_domain_public_cases" },
    shard: { shard_id: "shard_0002", case_ordinal_start: 101, case_ordinal_end: 200, max_cases: 100 },
    env: { ...readyProdEnv, INNGEST_EVENT_KEY: "", INNGEST_SIGNING_KEY: "", INNGEST_DEV: "1" },
  });
  assert(dispatched.manifest.status === "queued_local_manifest_only", "missing event key should keep local manifest only");

  if (errors.length) {
    console.error("Production runtime isolation validation failed:");
    errors.forEach(error => console.error(`- ${error}`));
    process.exit(1);
  }
  console.log("Production runtime isolation validation passed.");
})().catch(error => {
  console.error(error.message);
  process.exit(1);
});
