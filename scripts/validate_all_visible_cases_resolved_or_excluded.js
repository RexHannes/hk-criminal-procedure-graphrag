#!/usr/bin/env node
/* Enforce: every visible case seed is either paragraph-linked or excluded. */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const INVENTORY_PATH = path.join(ROOT, "artifacts", "all_visible_case_seed_inventory.json");
const REGISTRY_PATH = path.join(ROOT, "data", "legal_ingest", "case_authority_registry.json");
const errors = [];

function fail(message) {
  errors.push(message);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

const inventory = readJson(INVENTORY_PATH);
const registry = readJson(REGISTRY_PATH);
const counts = inventory.counts || {};

if (counts.total_case_like_seed_records !== counts.product_visible_verified_case_seed_nodes + counts.excluded_unresolved_seed_nodes) {
  fail("inventory counts do not add up to verified seeds + excluded seeds");
}
if (counts.visible_unverified_authorities !== 0) fail("visible_unverified_authorities must be 0");
if (counts.backend_searchable_unverified_authorities !== 0) fail("backend_searchable_unverified_authorities must be 0");
if (counts.product_visible_verified_case_seed_nodes !== registry.counts?.source_linked_case_seed_count) {
  fail("inventory verified seed count does not match registry");
}
if (counts.excluded_unresolved_seed_nodes !== registry.counts?.excluded_case_seed_count) {
  fail("inventory excluded seed count does not match registry");
}

for (const row of inventory.inventory || []) {
  const proofed = row.verified_authority_count > 0;
  if (row.product_status === "source_linked_public_judgment" && !proofed) fail(`${row.doctrine_node_id}: visible without proof`);
  if (row.product_status === "excluded_from_product_authority_surfaces" && proofed) fail(`${row.doctrine_node_id}: excluded despite proof`);
  if (!["source_linked_public_judgment", "excluded_from_product_authority_surfaces"].includes(row.product_status)) {
    fail(`${row.doctrine_node_id}: unknown product_status ${row.product_status}`);
  }
}

if (errors.length) {
  console.error("Resolved-or-excluded validation failed:");
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log("All visible case seeds are resolved-or-excluded.");
