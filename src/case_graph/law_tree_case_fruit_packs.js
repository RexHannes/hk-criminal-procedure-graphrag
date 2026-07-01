const fs = require("fs");
const path = require("path");
const {
  hasVerifiedPublicParagraphAuthority,
  quoteForAuthority,
  principleSummaryForAuthority,
} = require("./verified_case_authority");

const PACK_PATH = path.join(process.cwd(), "data", "legal_ingest", "case_corpus", "law_tree_case_fruit_packs.json");

let cachedPacks = null;

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadLawTreeCaseFruitPacks() {
  if (cachedPacks) return cachedPacks;
  cachedPacks = readJson(PACK_PATH, { trees: [] });
  return cachedPacks;
}

function evidenceFromAuthority(authority, tree) {
  return {
    evidence_id: authority.evidence_id || authority.authority_id,
    authority_id: authority.authority_id || authority.evidence_id,
    law_tree_id: tree.tree_id,
    issue_tag: tree.tree_id,
    issue_tags: authority.issue_tags || [tree.tree_id],
    domain_id: tree.domain_id,
    viewer_node_id: (tree.viewer_node_ids || [])[0] || "",
    viewer_node_ids: tree.viewer_node_ids || [],
    doctrine_node_id: (tree.doctrine_node_ids || [])[0] || "",
    doctrine_node_ids: tree.doctrine_node_ids || [],
    flow_step_id: (tree.flow_step_ids || [])[0] || "",
    flow_step_ids: tree.flow_step_ids || [],
    case_id: authority.case_id || "",
    case_name: authority.case_name,
    citation: authority.citation || authority.neutral_citation || "",
    neutral_citation: authority.neutral_citation || authority.citation || "",
    law_report_citation: authority.law_report_citation || "",
    court: authority.court || "",
    court_level: authority.court_level || "",
    judgment_date: authority.judgment_date || "",
    paragraph_id: authority.paragraph_id || "",
    paragraph_number: authority.paragraph_number || authority.para_no || "",
    para_no: authority.para_no || authority.paragraph_number || "",
    exact_quote: quoteForAuthority(authority),
    supporting_quote: quoteForAuthority(authority),
    paragraph_text: authority.paragraph_text || "",
    source_url: authority.source_url || "",
    checksum: authority.checksum || "",
    proposition_id: authority.proposition_id || "",
    proposition_text: authority.proposition_text || "",
    principle_id: authority.principle_id || "",
    principle_text: principleSummaryForAuthority(authority),
    application_note: authority.application_note || "",
    authority_role: authority.authority_role || "",
    verification_status: "paragraph_linked_public_source",
    source_verification_status: authority.source_verification_status || "source_verified_public",
    answer_layer_status: "research_only",
    answer_mode: "research_prototype",
    answer_safe: false,
    review_status: authority.review_status || "machine_candidate",
    lawyer_review_status: "unreviewed",
    professional_advice_certified: false,
    usable_in_research_prototype: true,
    current_treatment_status: authority.current_treatment_status || "unchecked",
    lineage_note: authority.lineage_note || "Verified law-tree case fruit pack evidence.",
  };
}

function lawTreeEvidenceForNode(nodeId, limit = 12) {
  const id = String(nodeId || "");
  if (!id) return [];
  const pack = loadLawTreeCaseFruitPacks();
  const out = [];
  for (const tree of pack.trees || []) {
    const ids = new Set([
      tree.tree_id,
      ...(tree.viewer_node_ids || []),
      ...(tree.doctrine_node_ids || []),
      ...(tree.flow_step_ids || []),
    ]);
    if (!ids.has(id)) continue;
    for (const authority of tree.verified_authorities || []) {
      const evidence = evidenceFromAuthority(authority, tree);
      if (hasVerifiedPublicParagraphAuthority(evidence)) out.push(evidence);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

function tokens(text) {
  return String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(token => token.length > 1);
}

function scoreTree(query, tree) {
  const terms = tokens(query);
  const blob = [
    tree.tree_id,
    tree.label,
    tree.broad_legal_topic,
    ...(tree.issue_tags || []),
    ...(tree.keywords || []),
    ...(tree.doctrine_node_ids || []),
    ...(tree.verified_authorities || []).slice(0, 10).flatMap(item => [
      item.case_name,
      item.neutral_citation,
      item.principle_text,
      item.proposition_text,
      item.exact_quote,
    ]),
  ].join(" ").toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (blob.includes(term)) score += 1;
    if ((tree.tree_id || "").toLowerCase().includes(term)) score += 3;
  }
  return score;
}

function searchLawTreeCaseFruitPacks(query, limit = 3) {
  const pack = loadLawTreeCaseFruitPacks();
  return (pack.trees || [])
    .map(tree => ({ tree, score: scoreTree(query, tree) }))
    .filter(item => item.score > 0 && (item.tree.verified_authorities || []).length)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(item => ({
      doctrine_node_id: (item.tree.doctrine_node_ids || [])[0] || item.tree.tree_id,
      source_node_id: (item.tree.viewer_node_ids || [])[0] || item.tree.tree_id,
      title: item.tree.label,
      node_type: "law_tree_case_fruit_pack",
      domain_id: item.tree.domain_id,
      section: "law_tree_case_fruits",
      summary: item.tree.broad_legal_topic,
      verification_status: "paragraph_linked_public_source",
      answer_layer_status: "research_only",
      authority_status: "source_verified_public",
      match_score: item.score,
      matched_via: [{ id: item.tree.tree_id, label: item.tree.label, type: "law_tree_case_fruit_pack" }],
      coverage_status: "paragraph_verified",
      evidence: (item.tree.verified_authorities || [])
        .slice(0, 12)
        .map(authority => evidenceFromAuthority(authority, item.tree))
        .filter(hasVerifiedPublicParagraphAuthority),
    }));
}

module.exports = {
  PACK_PATH,
  loadLawTreeCaseFruitPacks,
  lawTreeEvidenceForNode,
  searchLawTreeCaseFruitPacks,
};
