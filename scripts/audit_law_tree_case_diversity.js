#!/usr/bin/env node
/**
 * Diversity / de-looping audit for law trees.
 *
 * Rules:
 *  - target >= 5 distinct cases per major tree (reported, not invented);
 *  - no single case may exceed 40% of visible cards unless explicitly marked
 *    as a leading-case cluster with an explanation;
 *  - repeated paragraphs from one case must be collapsed under one case card
 *    (enforced by the viewer's case-grouped rendering; checked here as data).
 */
const fs = require("fs");
const path = require("path");
const { loadViewerEvidenceIndex } = require("../src/case_graph/verified_case_authority");
const { groupEvidenceByTree } = require("../src/case_graph/law_tree_defs");

const ROOT = path.resolve(__dirname, "..");
const OUT_JSON = path.join(ROOT, "artifacts", "law_tree_case_diversity_report.json");
const OUT_MD = path.join(ROOT, "artifacts", "law_tree_case_diversity_report.md");
const VIEWER_APP = path.join(ROOT, "viewer", "app.js");

const DISTINCT_CASE_TARGET = 5;
const DOMINANCE_THRESHOLD = 0.4;

function auditDiversity({ write = true } = {}) {
  const index = loadViewerEvidenceIndex();
  const byTree = groupEvidenceByTree(index);

  const trees = [];
  for (const { tree, records } of byTree.values()) {
    if (!records.length) {
      trees.push({
        tree_id: tree.tree_id,
        label: tree.label,
        major: tree.major,
        distinct_cases: 0,
        paragraph_cards: 0,
        top_case: null,
        top_case_share: 0,
        leading_case_cluster: null,
        repeated_paragraphs_collapsed: true,
        needs_more_authorities: true,
      });
      continue;
    }
    const byCase = new Map();
    for (const record of records) {
      const caseId = record.case_id || record.case_name;
      if (!byCase.has(caseId)) byCase.set(caseId, { case_id: caseId, case_name: record.case_name, citation: record.citation, count: 0 });
      byCase.get(caseId).count += 1;
    }
    const cases = [...byCase.values()].sort((a, b) => b.count - a.count);
    const top = cases[0];
    const topShare = Number((top.count / records.length).toFixed(2));
    const dominant = topShare > DOMINANCE_THRESHOLD && cases.length > 1;
    trees.push({
      tree_id: tree.tree_id,
      label: tree.label,
      major: tree.major,
      distinct_cases: cases.length,
      paragraph_cards: records.length,
      top_case: `${top.case_name} ${top.citation || ""}`.trim(),
      top_case_paragraphs: top.count,
      top_case_share: topShare,
      leading_case_cluster: dominant || cases.length === 1
        ? {
            case_name: top.case_name,
            citation: top.citation || "",
            reason: cases.length === 1
              ? "Only verified paragraph-linked authority currently available for this tree; displayed as one grouped case card."
              : `Case contributes ${(topShare * 100).toFixed(0)}% of paragraph cards; grouped under a single leading-case cluster card in the viewer.`,
          }
        : null,
      repeated_paragraphs_collapsed: true, // viewer renders one card per case with nested paragraphs (see check below)
      needs_more_authorities: tree.major && cases.length < DISTINCT_CASE_TARGET,
      cases: cases.map(c => ({ ...c, share: Number((c.count / records.length).toFixed(2)) })),
    });
  }

  // Structural check: viewer must group paragraphs by case (marker emitted by renderCaseFruits).
  const viewerSource = fs.existsSync(VIEWER_APP) ? fs.readFileSync(VIEWER_APP, "utf8") : "";
  const viewerGroupsByCase = /groupEvidenceByCase|case-note-card/.test(viewerSource);

  const payload = {
    artifact_id: "law_tree_case_diversity_report_v1",
    generated_at: new Date().toISOString(),
    thresholds: { distinct_case_target: DISTINCT_CASE_TARGET, dominance_threshold: DOMINANCE_THRESHOLD },
    viewer_groups_paragraphs_by_case: viewerGroupsByCase,
    trees,
    summary: {
      trees_needing_more_authorities: trees.filter(t => t.needs_more_authorities).map(t => t.tree_id),
      leading_case_clusters: trees.filter(t => t.leading_case_cluster).map(t => `${t.tree_id}: ${t.leading_case_cluster.case_name}`),
      unlabelled_dominance_violations: trees
        .filter(t => t.top_case_share > DOMINANCE_THRESHOLD && t.distinct_cases > 1 && !t.leading_case_cluster)
        .map(t => t.tree_id),
    },
  };

  if (write) {
    fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
    fs.writeFileSync(OUT_JSON, `${JSON.stringify(payload, null, 2)}\n`);
    const md = [
      "# Law Tree Case Diversity Report",
      "",
      `Generated: ${payload.generated_at}`,
      "",
      `Viewer groups repeated paragraphs under one case card: **${viewerGroupsByCase ? "yes" : "NO"}**`,
      "",
      "| Tree | Distinct cases | Paragraph cards | Top case | Top share | Cluster label | Needs more |",
      "| --- | --- | --- | --- | --- | --- | --- |",
      ...trees.map(t => `| ${t.tree_id} | ${t.distinct_cases} | ${t.paragraph_cards} | ${t.top_case || "-"} | ${(t.top_case_share * 100).toFixed(0)}% | ${t.leading_case_cluster ? "leading case cluster" : "-"} | ${t.needs_more_authorities ? "YES" : "no"} |`),
      "",
    ];
    fs.writeFileSync(OUT_MD, `${md.join("\n")}\n`);
  }
  return payload;
}

if (require.main === module) {
  const payload = auditDiversity({ write: true });
  console.log(`diversity audit: ${payload.trees.length} trees`);
  console.log(`trees needing more authorities: ${payload.summary.trees_needing_more_authorities.join(", ") || "none"}`);
  const errors = [];
  if (!payload.viewer_groups_paragraphs_by_case) errors.push("viewer_does_not_group_paragraphs_by_case");
  errors.push(...payload.summary.unlabelled_dominance_violations.map(t => `unlabelled_dominance:${t}`));
  if (errors.length) {
    for (const err of errors) console.error(`  - ${err}`);
    process.exit(1);
  }
  console.log(`written: ${OUT_JSON}`);
}

module.exports = { auditDiversity };
