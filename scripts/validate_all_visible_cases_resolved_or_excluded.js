#!/usr/bin/env node
const {
  collectCaseLikeInventory,
  loadViewerEvidenceIndex,
  EXCLUDED_REPORT_JSON,
} = require("../src/case_graph/verified_case_authority");
const fs = require("fs");

const errors = [];
const inventory = collectCaseLikeInventory();
const index = loadViewerEvidenceIndex();
const excluded = JSON.parse(fs.readFileSync(EXCLUDED_REPORT_JSON, "utf8"));
const verifiedIds = new Set(index.verified_case_seed_ids || []);
const excludedIds = new Set((excluded.records || []).map(r => r.doctrine_node_id));

for (const seed of inventory) {
  const verified = verifiedIds.has(seed.doctrine_node_id);
  const excludedSeed = excludedIds.has(seed.doctrine_node_id);
  if (!verified && !excludedSeed) {
    errors.push(`unaccounted_seed:${seed.doctrine_node_id}`);
  }
  if (verified && excludedSeed) {
    errors.push(`seed_both_verified_and_excluded:${seed.doctrine_node_id}`);
  }
}

const paragraphLinked = index.record_count || 0;
const total = inventory.length;

if (errors.length) {
  console.error(JSON.stringify({
    ok: false,
    errors,
    total,
    verified_seeds: verifiedIds.size,
    excluded: excludedIds.size,
    paragraph_linked_records: paragraphLinked,
  }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({
  ok: true,
  total,
  verified_seeds: verifiedIds.size,
  excluded: excludedIds.size,
  paragraph_linked_records: paragraphLinked,
  invariant: "all inventoried seeds are verified paragraph-linked seeds or excluded unresolved seeds",
}, null, 2));
