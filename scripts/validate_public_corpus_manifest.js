#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");
const { buildManifest } = require("./build_public_corpus_manifest");

const ROOT = path.resolve(__dirname, "..");
const VERTICAL_PATH = path.join(ROOT, "data", "legal_ingest", "verticals", "inconsistent_pleadings.json");

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

const vertical = JSON.parse(fs.readFileSync(VERTICAL_PATH, "utf8"));
const manifest = buildManifest(vertical);
const errors = [];

assert(manifest.scope === "public_demo_only", "manifest must be public_demo_only", errors);
assert(manifest.status === "pilot_not_production_corpus", "manifest must not claim production corpus", errors);
assert(manifest.source_counts.sources === 6, "pilot corpus should currently have 6 sources", errors);
assert(manifest.source_counts.legal_paragraphs === 6, "pilot corpus should currently have 6 paragraph cards", errors);
assert(manifest.source_counts.proposition_cards === 6, "pilot corpus should currently have 6 proposition cards", errors);
assert(manifest.source_counts.answer_safe_propositions === 0, "pilot propositions must not be answer_safe", errors);
assert((manifest.visibility_counts.public_demo || 0) === 6, "all pilot sources must be public_demo", errors);
assert((manifest.tenant_counts.public || 0) === 6, "all pilot sources must use tenant_id public", errors);
assert(manifest.corpus_gaps.includes("large_public_case_corpus_not_ingested"), "manifest must disclose corpus scale gap", errors);
assert(manifest.private_source_policy.includes("excluded"), "manifest must exclude private/client/licensed materials", errors);

if (errors.length) {
  console.error("Public corpus manifest validation failed:");
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log("Public corpus manifest validation passed.");
