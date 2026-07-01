#!/usr/bin/env node
/* Ensure product authority surfaces use only public paragraph-linked evidence. */

const fs = require("fs");
const path = require("path");
const { hasVerifiedPublicParagraphAuthority } = require("../src/case_graph/verified_case_authority");
const { viewerCaseCorpusEvidenceForNode } = require("../src/case_graph/viewer_case_corpus_evidence");

const ROOT = path.resolve(__dirname, "..");
const REGISTRY_PATH = path.join(ROOT, "data", "legal_ingest", "case_authority_registry.json");
const INVENTORY_PATH = path.join(ROOT, "artifacts", "all_visible_case_seed_inventory.json");
const errors = [];

function fail(message) {
  errors.push(message);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

const registry = readJson(REGISTRY_PATH);
const inventory = readJson(INVENTORY_PATH);

if (inventory.counts?.visible_unverified_authorities !== 0) fail("inventory reports visible unverified authorities");
if (inventory.counts?.backend_searchable_unverified_authorities !== 0) fail("inventory reports backend-searchable unverified authorities");

for (const item of registry.authorities || []) {
  if (!hasVerifiedPublicParagraphAuthority(item)) fail(`${item.authority_id || item.evidence_id}: registry authority lacks public paragraph proof`);
}

for (const seed of registry.case_seed_nodes || []) {
  const evidence = viewerCaseCorpusEvidenceForNode(seed.doctrine_node_id, 20);
  if (seed.product_status === "excluded_from_product_authority_surfaces" && evidence.length) {
    fail(`${seed.doctrine_node_id}: excluded seed returns viewer/backend evidence`);
  }
  for (const item of evidence) {
    if (!hasVerifiedPublicParagraphAuthority(item)) fail(`${seed.doctrine_node_id}: viewer helper returned unverified evidence`);
  }
}

if (errors.length) {
  console.error("Visible unverified authority validation failed:");
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log("No visible unverified case authorities found.");
