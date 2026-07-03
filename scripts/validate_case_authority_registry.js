#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { isVerifiedParagraphProof, loadViewerEvidenceIndex } = require("../src/case_graph/verified_case_authority");

const REGISTRY_PATH = path.join(__dirname, "..", "data", "legal_ingest", "case_authority_registry.json");
const errors = [];

if (!fs.existsSync(REGISTRY_PATH)) {
  console.error(JSON.stringify({ ok: false, errors: ["registry_missing"] }, null, 2));
  process.exit(1);
}

const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
const index = loadViewerEvidenceIndex();
const verifiedSeedIds = new Set(index.verified_case_seed_ids || []);

for (const seedId of verifiedSeedIds) {
  const indexHits = (index.by_doctrine_node_id || {})[seedId] || [];
  if (!indexHits.length) errors.push(`verified_seed_missing_index_proof:${seedId}`);
}

let searchableVerified = 0;
let searchableUnverified = 0;
for (const [doctrineId, items] of Object.entries(registry.entries || {})) {
  const verifiedItems = items.filter(item => isVerifiedParagraphProof({
    ...item,
    paragraph_number: item.para_no,
    exact_quote: item.exact_quote || item.supporting_quote,
    link_type: item.link_type,
  }));
  if (!verifiedItems.length) continue;
  searchableVerified += verifiedItems.length;
  if (verifiedItems.length < items.length) searchableUnverified += items.length - verifiedItems.length;
}

if (errors.length) {
  console.error(JSON.stringify({ ok: false, errors, searchableVerified, searchableUnverified }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({
  ok: true,
  entry_count: registry.entry_count,
  verified_seed_count: verifiedSeedIds.size,
  searchable_verified_items: searchableVerified,
  registry_unverified_fallback_items: searchableUnverified,
}, null, 2));
