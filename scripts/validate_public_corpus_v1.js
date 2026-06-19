#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CORPUS_DIR = path.join(ROOT, "data", "legal_ingest", "public_corpus_v1");
const PRIVATE_KINDS = new Set(["textbook_private", "precedent_private", "firm_precedent", "licensed_book", "private_doctrine_note"]);

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(CORPUS_DIR, name), "utf8"));
}

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

const errors = [];
const manifest = readJson("corpus_manifest.json");
const registry = readJson("source_registry.json");
const chunks = readJson("chunk_manifest.json");
const requirements = readJson("citation_requirements.json");
const sources = registry.sources || [];
const sourceIds = new Set(sources.map(source => source.source_id));

assert(manifest.source_count === sources.length, "corpus_manifest source_count must match source_registry", errors);
assert(manifest.source_visibility === "public_demo", "corpus manifest must be public_demo", errors);
assert(manifest.tenant_id === "public", "corpus manifest must use tenant_id public", errors);
assert(sources.length >= 30, "public corpus v1 should define at least 30 public/demo-safe source candidates", errors);

for (const source of sources) {
  assert(source.source_id, "source missing source_id", errors);
  assert(source.source_kind, `${source.source_id}: source_kind missing`, errors);
  assert(!PRIVATE_KINDS.has(source.source_kind), `${source.source_id}: private/licensed source kind cannot appear in public corpus`, errors);
  assert(source.source_visibility === "public_demo", `${source.source_id}: source_visibility must be public_demo`, errors);
  assert(source.tenant_id === "public", `${source.source_id}: tenant_id must be public`, errors);
  assert(source.jurisdiction === "HK", `${source.source_id}: jurisdiction must be HK`, errors);
  assert(Array.isArray(source.citation_fields_required) && source.citation_fields_required.length > 0, `${source.source_id}: citation requirements missing`, errors);
  assert(source.licence_status === "public_or_demo_safe", `${source.source_id}: licence_status must be public_or_demo_safe`, errors);
  assert(["not_ingested", "ingested", "chunked", "embedded", "reviewed"].includes(source.ingestion_status), `${source.source_id}: invalid ingestion_status`, errors);
  assert(requirements.requirements[source.source_kind], `${source.source_id}: no citation requirement template for ${source.source_kind}`, errors);
}

for (const chunk of chunks.chunks || []) {
  assert(chunk.chunk_id, "chunk missing chunk_id", errors);
  assert(chunk.chunk_hash && /^[0-9a-f]{64}$/.test(chunk.chunk_hash), `${chunk.chunk_id}: invalid chunk_hash`, errors);
  assert(chunk.source_id && sourceIds.has(chunk.source_id), `${chunk.chunk_id}: source linkage missing`, errors);
  assert(chunk.source_visibility === "public_demo", `${chunk.chunk_id}: source_visibility must be public_demo`, errors);
  assert(chunk.tenant_id === "public", `${chunk.chunk_id}: tenant_id must be public`, errors);
  assert(chunk.source_kind, `${chunk.chunk_id}: source_kind missing`, errors);
  assert(chunk.review_state, `${chunk.chunk_id}: review_state missing`, errors);
  if (chunk.source_kind === "case") {
    assert(chunk.citation && chunk.pinpoint, `${chunk.chunk_id}: case chunks require citation and pinpoint`, errors);
  }
}

if (errors.length) {
  console.error("Public corpus v1 validation failed:");
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log("Public corpus v1 validation passed.");
