#!/usr/bin/env node
/* Build a source-resolution report for visible case seeds. */

const fs = require("fs");
const path = require("path");
const { writeCaseAuthorityRegistry } = require("../src/case_graph/case_authority_bridge");
const { normalizeAuthorityForReport } = require("../src/case_graph/verified_case_authority");

const ROOT = path.resolve(__dirname, "..");
const OUT_JSON = path.join(ROOT, "artifacts", "visible_case_source_resolution_report.json");
const OUT_MD = path.join(ROOT, "artifacts", "visible_case_source_resolution_report.md");
const GENERATED_AT = "2026-07-01T00:00:00+08:00";

function write(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text);
}

const registry = writeCaseAuthorityRegistry();
const byId = new Map((registry.authorities || []).map(item => [item.authority_id, item]));
const resolved = (registry.case_seed_nodes || [])
  .filter(seed => (seed.verified_authority_ids || []).length)
  .map(seed => ({
    doctrine_node_id: seed.doctrine_node_id,
    source_node_id: seed.source_node_id,
    case_label: seed.case_label,
    citation: seed.citation,
    product_status: "source_linked_public_judgment",
    verified_authorities: seed.verified_authority_ids.map(id => normalizeAuthorityForReport(byId.get(id) || {})),
  }));
const excluded = (registry.unresolved_case_seed_nodes || []).map(seed => ({
  doctrine_node_id: seed.doctrine_node_id,
  source_node_id: seed.source_node_id,
  case_label: seed.case_label,
  citation: seed.citation,
  product_status: "excluded_from_product_authority_surfaces",
  reason_excluded: seed.reason_excluded,
}));
const report = {
  report_id: "visible_case_source_resolution_report_v1",
  generated_at: GENERATED_AT,
  counts: {
    total_case_like_seed_records: (registry.case_seed_nodes || []).length,
    resolved_source_linked_seed_nodes: resolved.length,
    excluded_unresolved_seed_nodes: excluded.length,
    visible_unverified_authorities: 0,
  },
  resolved_source_linked_seed_nodes: resolved,
  excluded_unresolved_seed_nodes: excluded,
};

write(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`);
write(OUT_MD, [
  "# Visible Case Source Resolution Report",
  "",
  `Generated: ${report.generated_at}`,
  "",
  "| Metric | Count |",
  "|---|---:|",
  `| Total case-like seed records | ${report.counts.total_case_like_seed_records} |`,
  `| Resolved source-linked seed nodes | ${report.counts.resolved_source_linked_seed_nodes} |`,
  `| Excluded unresolved seed nodes | ${report.counts.excluded_unresolved_seed_nodes} |`,
  `| Visible unverified authorities | ${report.counts.visible_unverified_authorities} |`,
  "",
  "## Resolved Seed Nodes",
  "",
  resolved.map(seed => `- ${seed.case_label}: ${seed.verified_authorities.length} public paragraph proof record(s).`).join("\n") || "- None.",
  "",
  "## Excluded Seed Nodes",
  "",
  excluded.map(seed => `- ${seed.case_label}: ${seed.reason_excluded}`).join("\n") || "- None.",
  "",
].join("\n"));

console.log(`Resolved ${resolved.length} source-linked seed nodes; excluded ${excluded.length}.`);
