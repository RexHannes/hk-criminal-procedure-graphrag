#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");
const { report } = require("./report_mvp_readiness");

const ROOT = path.resolve(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

const errors = [];
const readiness = report();

assert(readiness.estimated_overall_done_percent >= 45, "readiness estimate should reflect current scaffold progress", errors);
assert(readiness.estimated_overall_done_percent < 80, "readiness estimate must not overclaim production readiness", errors);

for (const file of [
  "data/legal_ingest/corpus/public_corpus_manifest.sample.json",
  "scripts/build_public_corpus_manifest.js",
  "scripts/validate_public_corpus_manifest.js",
  "src/legal_answer/hybrid_retriever.js",
  "scripts/validate_hybrid_retrieval.js",
  "src/legal_answer/review/promotion.js",
  "scripts/validate_review_promotion.js",
  "src/legal_answer/access/private_source_policy.js",
  "scripts/validate_private_source_access.js",
  "docs/production-hardening-roadmap.md",
]) {
  assert(fs.existsSync(path.join(ROOT, file)), `missing ${file}`, errors);
}

for (const token of ["machine_candidate", "quote_verified", "source_verified", "lawyer_reviewed", "answer_safe"]) {
  assert(read("src/legal_answer/review/promotion.js").includes(token), `review promotion missing ${token}`, errors);
}

for (const token of ["hybrid_vector_lexical_metadata_v1", "metadata_filters_preserved", "local_deterministic"]) {
  assert(read("src/legal_answer/hybrid_retriever.js").includes(token), `hybrid retriever missing ${token}`, errors);
}

for (const token of ["private_ingestion_disabled", "tenant_mismatch", "licensed_private_requires_explicit_policy"]) {
  assert(read("src/legal_answer/access/private_source_policy.js").includes(token), `private access policy missing ${token}`, errors);
}

if (errors.length) {
  console.error("Production hardening scaffold validation failed:");
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log("Production hardening scaffold validation passed.");
