#!/usr/bin/env node
/**
 * Relevance audit: classifies every authority in every law tree so a tree
 * cannot look strong merely because it holds many paragraphs from one case.
 *
 * Classifications:
 *   leading_authority / appellate_authority / recent_application /
 *   trial_level_example / weak_background_authority / wrong_fit_needs_remapping
 * plus duplicate-paragraph tracking per case.
 */
const fs = require("fs");
const path = require("path");
const { loadViewerEvidenceIndex } = require("../src/case_graph/verified_case_authority");
const { loadStructuredCaseNotes, caseLevelFromCitation } = require("../src/case_graph/structured_case_notes");
const { LAW_TREES, groupEvidenceByTree } = require("../src/case_graph/law_tree_defs");

const ROOT = path.resolve(__dirname, "..");
const OUT_JSON = path.join(ROOT, "artifacts", "case_authority_relevance_report.json");
const OUT_MD = path.join(ROOT, "artifacts", "case_authority_relevance_report.md");

function classifyCase(tree, caseGroup, notesById) {
  const note = notesById.get(caseGroup.case_id) || {};
  const level = note.case_level || caseLevelFromCitation(caseGroup.citation || "", note.court || "");
  const nodeTagTokens = caseGroup.paragraphs
    .flatMap(p => String(p.doctrine_node_id || "").split(".").slice(1).join("_").split("_"))
    .filter(Boolean);
  const tags = new Set([...(note.sub_issue_tags || []), ...caseGroup.issue_tags, ...nodeTagTokens]);
  const tagOverlap = tree.expected_tags.filter(tag =>
    [...tags].some(t => String(t).toLowerCase().includes(tag) || tag.includes(String(t).toLowerCase())));
  const year = Number(String(note.judgment_date || caseGroup.citation || "").match(/(19|20)\d{2}/)?.[0] || 0);
  const statesRule = caseGroup.paragraphs.some(p => /states_rule|sets_out_test|ratio/.test(p.paragraph_role || "") )
    || (note.authority_role || "").includes("ratio")
    || (note.paragraph_refs || []).some(p => /states_rule|sets_out_test/.test(p.paragraph_role || ""));

  let classification;
  if (!tagOverlap.length) classification = "wrong_fit_needs_remapping";
  else if (level === "CFA") classification = "leading_authority";
  else if (level === "CFA" || level === "CA") classification = "appellate_authority";
  else if (year >= 2020) classification = "recent_application";
  else if (level === "CFI" || level === "DC") classification = "trial_level_example";
  else classification = "weak_background_authority";

  if (classification !== "wrong_fit_needs_remapping" && caseGroup.paragraphs.length === 1 && !statesRule && level !== "CFA" && level !== "CA" && year < 2020) {
    classification = "weak_background_authority";
  }

  const rightParagraph = caseGroup.paragraphs.every(p =>
    p.exact_quote && p.paragraph_text && String(p.paragraph_text).includes(String(p.exact_quote)) && (p.proposition_text || p.principle_text));

  return {
    case_id: caseGroup.case_id,
    case_name: caseGroup.case_name,
    citation: caseGroup.citation,
    case_level: level,
    paragraph_count: caseGroup.paragraphs.length,
    duplicate_paragraphs_from_same_case: Math.max(0, caseGroup.paragraphs.length - 1),
    classification,
    supports_tree: tagOverlap.length > 0,
    matched_tree_tags: tagOverlap,
    right_paragraph: rightParagraph,
    background_only: classification === "weak_background_authority",
  };
}

function auditRelevance({ write = true } = {}) {
  const index = loadViewerEvidenceIndex();
  const notes = loadStructuredCaseNotes();
  const notesById = new Map((notes.notes || []).map(n => [n.case_id, n]));
  const byTree = groupEvidenceByTree(index);

  const trees = [];
  for (const { tree, records } of byTree.values()) {
    const byCase = new Map();
    for (const record of records) {
      const caseId = record.case_id || record.case_name;
      if (!byCase.has(caseId)) {
        byCase.set(caseId, {
          case_id: caseId,
          case_name: record.case_name,
          citation: record.citation || record.neutral_citation,
          issue_tags: [],
          paragraphs: [],
        });
      }
      const group = byCase.get(caseId);
      group.paragraphs.push(record);
      group.issue_tags.push(...(record.issue_tags || []));
    }

    const authorities = [...byCase.values()].map(group => classifyCase(tree, group, notesById));
    const totalParas = records.length;
    for (const authority of authorities) {
      authority.paragraph_share = totalParas ? Number((authority.paragraph_count / totalParas).toFixed(2)) : 0;
      authority.overused = authority.paragraph_share > 0.4 && authorities.length > 1;
    }
    const hasLeading = authorities.some(a => a.classification === "leading_authority");
    const hasAppellate = authorities.some(a => ["leading_authority", "appellate_authority"].includes(a.classification));
    trees.push({
      tree_id: tree.tree_id,
      label: tree.label,
      major: tree.major,
      distinct_cases: authorities.length,
      paragraph_cards: totalParas,
      authorities: authorities.sort((a, b) => b.paragraph_count - a.paragraph_count),
      better_leading_case_missing: !hasLeading,
      missing_appellate_authority: !hasAppellate,
      wrong_fit_count: authorities.filter(a => a.classification === "wrong_fit_needs_remapping").length,
    });
  }

  const payload = {
    artifact_id: "case_authority_relevance_report_v1",
    generated_at: new Date().toISOString(),
    trees,
    summary: {
      total_trees: trees.length,
      trees_missing_leading_authority: trees.filter(t => t.better_leading_case_missing).map(t => t.tree_id),
      trees_with_wrong_fit: trees.filter(t => t.wrong_fit_count > 0).map(t => t.tree_id),
      overused_authorities: trees.flatMap(t => t.authorities.filter(a => a.overused).map(a => `${t.tree_id}:${a.case_name}`)),
    },
  };

  if (write) {
    fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
    fs.writeFileSync(OUT_JSON, `${JSON.stringify(payload, null, 2)}\n`);
    const md = [
      "# Case Authority Relevance Report",
      "",
      `Generated: ${payload.generated_at}`,
      "",
      "| Tree | Distinct cases | Paragraphs | Leading missing | Wrong-fit | Overused |",
      "| --- | --- | --- | --- | --- | --- |",
      ...trees.map(t => `| ${t.tree_id} | ${t.distinct_cases} | ${t.paragraph_cards} | ${t.better_leading_case_missing ? "YES" : "no"} | ${t.wrong_fit_count} | ${t.authorities.filter(a => a.overused).length} |`),
      "",
    ];
    for (const t of trees) {
      md.push(`## ${t.label} (\`${t.tree_id}\`)`, "", "| Case | Level | Class | Paras | Share | Supports tree | Right paragraph |", "| --- | --- | --- | --- | --- | --- | --- |");
      for (const a of t.authorities) {
        md.push(`| ${a.case_name} ${a.citation || ""} | ${a.case_level} | ${a.classification} | ${a.paragraph_count} | ${(a.paragraph_share * 100).toFixed(0)}% | ${a.supports_tree ? "yes" : "NO"} | ${a.right_paragraph ? "yes" : "NO"} |`);
      }
      md.push("");
    }
    fs.writeFileSync(OUT_MD, `${md.join("\n")}\n`);
  }
  return payload;
}

if (require.main === module) {
  const payload = auditRelevance({ write: true });
  const errors = [];
  for (const tree of payload.trees) {
    for (const authority of tree.authorities) {
      if (!authority.right_paragraph) errors.push(`bad_paragraph_proof:${tree.tree_id}:${authority.case_id}`);
      if (!authority.supports_tree) console.warn(`WARN wrong-fit authority: ${tree.tree_id} <- ${authority.case_name}`);
    }
  }
  console.log(`relevance audit: ${payload.trees.length} trees; wrong-fit trees: ${payload.summary.trees_with_wrong_fit.join(", ") || "none"}`);
  console.log(`trees missing leading authority: ${payload.summary.trees_missing_leading_authority.join(", ") || "none"}`);
  console.log(`written: ${OUT_JSON}`);
  if (errors.length) {
    for (const err of errors.slice(0, 10)) console.error(`  - ${err}`);
    process.exit(1);
  }
}

module.exports = { auditRelevance };
