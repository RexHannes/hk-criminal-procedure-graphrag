#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const {
  collectCaseLikeInventory,
  loadViewerEvidenceIndex,
  resolveAllVisibleCaseSources,
  INVENTORY_JSON,
  EXCLUDED_REPORT_JSON,
} = require("../src/case_graph/verified_case_authority");

const ROOT = path.resolve(__dirname, "..");
const outJson = path.join(ROOT, "artifacts", "all_visible_case_seed_inventory.json");
const outMd = path.join(ROOT, "artifacts", "all_visible_case_seed_inventory.md");

if (!fs.existsSync(INVENTORY_JSON)) {
  resolveAllVisibleCaseSources({ write: true });
}

const inventory = collectCaseLikeInventory();
const index = loadViewerEvidenceIndex();
const excluded = JSON.parse(fs.readFileSync(EXCLUDED_REPORT_JSON, "utf8"));
const verifiedIds = new Set(index.verified_case_seed_ids || []);
const excludedIds = new Set((excluded.records || []).map(r => r.doctrine_node_id));
const searchableIds = new Set(index.searchable_doctrine_node_ids || []);

const records = inventory.map(seed => {
  const verified = verifiedIds.has(seed.doctrine_node_id);
  const excludedSeed = excludedIds.has(seed.doctrine_node_id);
  let resolved_status = "unresolved";
  if (verified) resolved_status = "paragraph_linked_public_source";
  else if (excludedSeed) resolved_status = "excluded_unverified_seed";

  return {
    ...seed,
    original_file: `data/legal_domain_packs/demo_maps/**/nodes/*.json`,
    visible_in_frontend: verified,
    searchable_in_backend: searchableIds.has(seed.doctrine_node_id) || verified,
    resolved_status,
  };
});

const payload = {
  generated_at: new Date().toISOString(),
  total_inventoried: records.length,
  records,
};

fs.writeFileSync(outJson, `${JSON.stringify(payload, null, 2)}\n`);

const md = [
  "# All Visible Case Seed Inventory",
  "",
  `Generated: ${payload.generated_at}`,
  "",
  `Total inventoried: **${payload.total_inventoried}**`,
  "",
  "| Doctrine node | Label | Citation | Resolved status | Frontend | Backend |",
  "|---|---|---|---|---|---|",
  ...records.map(r =>
    `| ${r.doctrine_node_id} | ${String(r.label).replace(/\|/g, "\\|")} | ${r.neutral_citation || "—"} | ${r.resolved_status} | ${r.visible_in_frontend ? "yes" : "no"} | ${r.searchable_in_backend ? "yes" : "no"} |`,
  ),
  "",
].join("\n");
fs.writeFileSync(outMd, `${md}\n`);

console.log(JSON.stringify({ ok: true, total_inventoried: records.length, path: outJson }, null, 2));
