#!/usr/bin/env node
/* Inventory every visible case-like seed and classify it as paragraph-linked or excluded. */

const fs = require("fs");
const path = require("path");
const { writeCaseAuthorityRegistry } = require("../src/case_graph/case_authority_bridge");
const {
  hasVerifiedPublicParagraphAuthority,
  normalizeAuthorityForReport,
  principleSummaryForAuthority,
} = require("../src/case_graph/verified_case_authority");

const ROOT = path.resolve(__dirname, "..");
const OUT_JSON = path.join(ROOT, "artifacts", "all_visible_case_seed_inventory.json");
const OUT_MD = path.join(ROOT, "artifacts", "all_visible_case_seed_inventory.md");
const GENERATED_AT = "2026-07-01T00:00:00+08:00";

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function writeText(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text);
}

function markdownTable(rows) {
  return [
    "| Domain | Node | Case | Citation | Product status | Proof records |",
    "|---|---|---|---|---|---:|",
    ...rows.map(row => `| ${[
      row.domain_id,
      row.source_node_id,
      row.case_label,
      row.citation || "-",
      row.product_status,
      row.verified_authority_count,
    ].map(value => String(value).replace(/\|/g, "\\|")).join(" | ")} |`),
  ].join("\n");
}

function buildInventory() {
  const registry = writeCaseAuthorityRegistry();
  const byId = new Map((registry.authorities || []).map(item => [item.authority_id, item]));
  const sourceLinkedSeeds = (registry.case_seed_nodes || []).filter(item => (item.verified_authority_ids || []).length);
  const excludedSeeds = registry.unresolved_case_seed_nodes || [];
  const visibleUnverified = (registry.case_seed_nodes || []).filter(item =>
    item.product_status !== "excluded_from_product_authority_surfaces" &&
    !(item.verified_authority_ids || []).length
  );
  const backendUnverified = (registry.authorities || []).filter(item => !hasVerifiedPublicParagraphAuthority(item));
  const authorities = registry.authorities || [];
  const sourceUrls = new Set(authorities.map(item => item.source_url).filter(Boolean));
  const exactQuoteCount = authorities.filter(item => item.exact_quote || item.supporting_quote).length;
  const shortSummaryCount = authorities.filter(principleSummaryForAuthority).length;
  const inventoryRows = (registry.case_seed_nodes || []).map(seed => ({
    domain_id: seed.domain_id,
    source_file: seed.source_file,
    source_node_id: seed.source_node_id,
    doctrine_node_id: seed.doctrine_node_id,
    case_label: seed.case_label,
    citation: seed.citation,
    product_status: seed.product_status,
    verified_authority_count: (seed.verified_authority_ids || []).length,
    verified_authorities: (seed.verified_authority_ids || []).map(id => normalizeAuthorityForReport(byId.get(id) || {})),
    excluded_reason: seed.product_status === "excluded_from_product_authority_surfaces"
      ? "No public paragraph-linked proof with exact quote is attached."
      : "",
  }));

  return {
    report_id: "all_visible_case_seed_inventory_v1",
    generated_at: GENERATED_AT,
    invariant: "case-like seed records = paragraph_linked_public_source seeds + excluded_unverified_seed records",
    counts: {
      total_case_like_seed_records: registry.counts.scanned_case_seed_count,
      paragraph_linked_public_source_records: registry.counts.verified_authority_count,
      product_visible_verified_case_seed_nodes: sourceLinkedSeeds.length,
      doctrine_nodes_with_verified_evidence: Object.keys(registry.by_doctrine_node_id || {}).length,
      excluded_unresolved_seed_nodes: excludedSeeds.length,
      visible_unverified_authorities: visibleUnverified.length,
      backend_searchable_unverified_authorities: backendUnverified.length,
      hklii_legalref_judiciary_links: sourceUrls.size,
      exact_quotes: exactQuoteCount,
      short_summaries: shortSummaryCount,
    },
    product_claim: "The product UI/backend expose only paragraph-linked public-source authority; unresolved seed cases are excluded from authority surfaces and tracked in developer audit.",
    visible_unverified_authorities: visibleUnverified,
    backend_searchable_unverified_authorities: backendUnverified.map(normalizeAuthorityForReport),
    inventory: inventoryRows,
  };
}

const inventory = buildInventory();
writeJson(OUT_JSON, inventory);
writeText(OUT_MD, [
  "# All Visible Case Seed Inventory",
  "",
  `Generated: ${inventory.generated_at}`,
  "",
  inventory.product_claim,
  "",
  "| Metric | Count |",
  "|---|---:|",
  `| Total case-like seed records | ${inventory.counts.total_case_like_seed_records} |`,
  `| Paragraph-linked public-source records | ${inventory.counts.paragraph_linked_public_source_records} |`,
  `| Product-visible verified case seed nodes | ${inventory.counts.product_visible_verified_case_seed_nodes} |`,
  `| Doctrine nodes with verified evidence | ${inventory.counts.doctrine_nodes_with_verified_evidence} |`,
  `| Excluded unresolved seed nodes | ${inventory.counts.excluded_unresolved_seed_nodes} |`,
  `| Visible unverified authorities | ${inventory.counts.visible_unverified_authorities} |`,
  `| Backend-searchable unverified authorities | ${inventory.counts.backend_searchable_unverified_authorities} |`,
  `| HKLII/LegalRef/Judiciary links | ${inventory.counts.hklii_legalref_judiciary_links} |`,
  `| Exact quotes | ${inventory.counts.exact_quotes} |`,
  `| Short summaries | ${inventory.counts.short_summaries} |`,
  "",
  "## Seed Records",
  "",
  markdownTable(inventory.inventory),
  "",
].join("\n"));

console.log(`Inventoried ${inventory.counts.total_case_like_seed_records} case-like seed records; ${inventory.counts.product_visible_verified_case_seed_nodes} have paragraph proof and ${inventory.counts.excluded_unresolved_seed_nodes} are excluded.`);
