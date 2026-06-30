#!/usr/bin/env node
/* Build the developer-only audit of legacy case seeds excluded from product authority surfaces. */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DATA_ROOT = path.join(ROOT, "data", "legal_domain_packs", "demo_maps");
const SEED_SOURCE_PATH = path.join(ROOT, "data", "legal_ingest", "case_corpus", "viewer_seed_case_public_sources.json");
const OUT_JSON = path.join(ROOT, "artifacts", "excluded_unverified_case_seeds_report.json");
const OUT_MD = path.join(ROOT, "artifacts", "excluded_unverified_case_seeds_report.md");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function listJsonFiles(dir) {
  const out = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) out.push(...listJsonFiles(full));
    else if (item.name.endsWith(".json")) out.push(full);
  }
  return out;
}

function citationFromLabel(label = "") {
  const bracket = String(label).match(/\[[^\]]+\]\s+[A-Z]{2,}[A-Z0-9 ]*\s+\d+|\(\d{4}\)\s+\d+\s+[A-Z]{2,}[A-Z0-9 ]*\s+\d+|\[\d{4}\]\s+[A-Z]{2,}[A-Z0-9 ]*\s+\d+/);
  return bracket ? bracket[0].trim() : "";
}

function collectSeeds() {
  const seeds = [];
  for (const filePath of listJsonFiles(DATA_ROOT).filter(file => file.includes(`${path.sep}nodes${path.sep}`))) {
    const payload = readJson(filePath);
    const domainId = path.relative(DATA_ROOT, filePath).split(path.sep)[0];
    for (const node of payload.nodes || []) {
      if (node.type !== "case_seed") continue;
      seeds.push({
        domain_id: domainId,
        source_file: path.relative(ROOT, filePath),
        original_node_id: node.id,
        doctrine_node_id: `${domainId}.${node.id}`,
        case_label: node.label || node.id,
        citation: node.neutral_citation || citationFromLabel(node.label || ""),
        summary: node.summary || "",
        original_verification_status: node.verification_status || "",
        original_authority_status: node.authority_status || "",
      });
    }
  }
  return seeds.sort((a, b) =>
    a.domain_id.localeCompare(b.domain_id) ||
    a.case_label.localeCompare(b.case_label) ||
    a.original_node_id.localeCompare(b.original_node_id)
  );
}

function collectProofedSeedIds() {
  if (!fs.existsSync(SEED_SOURCE_PATH)) return new Set();
  const sourcePayload = readJson(SEED_SOURCE_PATH);
  const ids = new Set();
  for (const item of sourcePayload.evidence || []) {
    if (!item.source_url || !/#p\d+/i.test(item.source_url) || !item.exact_quote || item.answer_safe !== false) continue;
    for (const sourceId of item.source_node_ids || []) ids.add(sourceId);
    for (const doctrineId of item.doctrine_node_ids || []) ids.add(doctrineId);
  }
  return ids;
}

function build() {
  const seeds = collectSeeds();
  const proofed = collectProofedSeedIds();
  const excluded = [];
  const verified = [];
  for (const seed of seeds) {
    if (proofed.has(seed.original_node_id) || proofed.has(seed.doctrine_node_id)) {
      verified.push({
        ...seed,
        product_status: "visible_only_with_paragraph_proof",
      });
      continue;
    }
    excluded.push({
      ...seed,
      product_status: "excluded_from_product_authority_surfaces",
      reason_excluded: "No committed HKLII/LegalRef/Judiciary paragraph-linked proof card with exact quote is attached to this seed.",
      search_attempted: [
        "checked viewer_seed_case_public_sources.json",
        "checked committed viewer_evidence_index.json mappings",
        "left for future HKLII/LegalRef discovery if exact public paragraph proof can be found",
      ],
      source_resolution_status: "exact_public_source_not_attached",
      paragraph_proof_status: "missing",
      can_be_revisited_later: true,
    });
  }

  const report = {
    report_id: "excluded_unverified_case_seeds_report_v1",
    generated_at: "2026-06-30T21:15:00+08:00",
    product_rule: "VISIBLE AUTHORITY = VERIFIED PARAGRAPH-LINKED PUBLIC SOURCE ONLY",
    counts: {
      total_case_seed_nodes: seeds.length,
      verified_seed_nodes: verified.length,
      excluded_unverified_seed_nodes: excluded.length,
    },
    verified_seed_nodes: verified,
    excluded_unverified_seed_nodes: excluded,
  };

  fs.writeFileSync(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`);

  const rows = excluded.map(item => [
    item.domain_id,
    item.original_node_id,
    item.case_label,
    item.citation || "-",
    item.source_resolution_status,
  ]);
  const md = [
    "# Excluded Unverified Case Seeds Report",
    "",
    `Generated: ${report.generated_at}`,
    "",
    `Product rule: **${report.product_rule}**.`,
    "",
    "| Metric | Count |",
    "|---|---:|",
    `| Total legacy case_seed nodes | ${report.counts.total_case_seed_nodes} |`,
    `| Verified seed nodes visible with paragraph proof | ${report.counts.verified_seed_nodes} |`,
    `| Excluded seed nodes | ${report.counts.excluded_unverified_seed_nodes} |`,
    "",
    "## Verified Seed Nodes",
    "",
    verified.length
      ? verified.map(item => `- ${item.case_label} (${item.domain_id}/${item.original_node_id})`).join("\n")
      : "- None.",
    "",
    "## Excluded Seed Nodes",
    "",
    "These are developer-audit records only. They must not be displayed as product authority unless a public paragraph proof card is later attached.",
    "",
    "| Domain | Node ID | Case label | Citation | Resolution status |",
    "|---|---|---|---|---|",
    ...rows.map(row => `| ${row.map(value => String(value).replace(/\|/g, "\\|")).join(" | ")} |`),
    "",
  ].join("\n");
  fs.writeFileSync(OUT_MD, md);

  return report;
}

const report = build();
console.log(`Excluded ${report.counts.excluded_unverified_seed_nodes} unverified case seeds; ${report.counts.verified_seed_nodes} seed node(s) remain visible with paragraph proof.`);
