#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

const errors = [];
const retriever = read("src/legal_answer/qdrant_retriever.js");
const indexer = read("scripts/index_legal_ingest_qdrant.js");
const auth = read("src/api/auth.py");
const routes = read("src/api/routes_legal_query.py");
const sourceSample = JSON.parse(read("data/legal_ingest/samples/source_registry.sample.json"));
const vertical = JSON.parse(read("data/legal_ingest/verticals/inconsistent_pleadings.json"));

for (const token of ["source_visibility", "tenant_id", "publicDemoFilter", "tenantRetrievalFilter", "PRIVATE_SOURCE_INGESTION_ENABLED"]) {
  assert(retriever.includes(token), `qdrant retriever missing ${token}`, errors);
}

for (const token of ['matchValue("source_visibility", "public_demo")', 'matchValue("tenant_id", "public")']) {
  assert(retriever.includes(token), `public retrieval filter missing ${token}`, errors);
}

for (const token of ['matchValue("source_visibility", "private_tenant")', "tenantId", "includePrivate"]) {
  assert(retriever.includes(token), `tenant retrieval filter missing ${token}`, errors);
}

for (const token of ['source_visibility: "public_demo"', 'tenant_id: "public"']) {
  assert(indexer.includes(token), `qdrant fixture payloads missing ${token}`, errors);
}

assert(!routes.includes("payload.tenant_id"), "API must not trust tenant_id from request body", errors);
assert(auth.includes("tenant_id = org_id or user_id"), "auth scaffold should derive tenant_id from org_id or user_id", errors);
assert(routes.includes("private_source_ingestion_disabled"), "private ingestion must fail closed by default", errors);

for (const fixture of [...(sourceSample.sources || []), ...(vertical.source_registry || []), ...(vertical.legal_paragraphs || [])]) {
  assert(fixture.source_visibility, `${fixture.source_id || fixture.paragraph_id}: source_visibility missing`, errors);
  assert(fixture.tenant_id, `${fixture.source_id || fixture.paragraph_id}: tenant_id missing`, errors);
  if (fixture.source_visibility === "public_demo") {
    assert(fixture.tenant_id === "public", `${fixture.source_id || fixture.paragraph_id}: public_demo must use tenant_id=public`, errors);
  }
}

if (errors.length) {
  console.error("Tenant filter validation failed:");
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log("Tenant filter validation passed.");
