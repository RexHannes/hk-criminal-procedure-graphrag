#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const BATCH = path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "bail_public_batch_v1");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function extractDis(fetchUrl) {
  const match = String(fetchUrl || "").match(/[?&]DIS=(\d+)/i);
  return match ? match[1] : "";
}

function collectDuplicate(items, keyName, getKey) {
  const seen = new Map();
  const duplicates = [];
  for (const item of items) {
    const key = normalize(getKey(item));
    if (!key) continue;
    if (seen.has(key)) {
      duplicates.push({
        key_name: keyName,
        key,
        first_source_id: seen.get(key),
        duplicate_source_id: item.source_id,
      });
    } else {
      seen.set(key, item.source_id);
    }
  }
  return duplicates;
}

const manifest = readJson(path.join(BATCH, "source_manifest.json"));
const sources = manifest.sources || [];
const errors = [];

const duplicateChecks = [
  ["source_id", source => source.source_id],
  ["case_id", source => source.case_id],
  ["neutral_citation", source => source.neutral_citation],
  ["fetch_url", source => source.fetch_url],
  ["legalref_dis", source => extractDis(source.fetch_url)],
];

for (const [keyName, getKey] of duplicateChecks) {
  for (const duplicate of collectDuplicate(sources, keyName, getKey)) {
    errors.push(`${duplicate.key_name}:${duplicate.key} reused by ${duplicate.first_source_id} and ${duplicate.duplicate_source_id}`);
  }
}

for (const source of sources) {
  if (!extractDis(source.fetch_url)) errors.push(`${source.source_id}: missing LegalRef DIS in fetch_url`);
  if (source.source_visibility !== "public_demo") errors.push(`${source.source_id}: source_visibility must be public_demo`);
  if (source.tenant_id !== "public") errors.push(`${source.source_id}: tenant_id must be public`);
  if (source.licence_status !== "public_judgment") errors.push(`${source.source_id}: licence_status must be public_judgment`);
}

if (errors.length) {
  console.error("Bail source dedupe validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Bail source dedupe validation passed: ${sources.length} unique public LegalRef sources.`);
