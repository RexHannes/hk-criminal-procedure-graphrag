const fs = require("fs");

function tokenize(value) {
  return String(value || "")
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/)
    .filter(token => token.length >= 3);
}

function lexicalScore(query, card) {
  const terms = new Set(tokenize(query));
  const haystack = [
    card.proposition_text,
    card.exact_quote,
    card.case_id,
    card.significance_label,
    card.authority_role,
    ...(card.tree_node_ids || []),
  ].join(" ").toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (haystack.includes(term)) score += 1;
  }
  return score;
}

function classifyLikelyTreeNodes(query, taxonomy) {
  const text = String(query || "").toLowerCase();
  const nodeIds = new Set();
  for (const family of taxonomy.families || []) {
    if ((family.keywords || []).some(keyword => text.includes(String(keyword).toLowerCase()))) {
      for (const nodeId of family.tree_node_ids || []) nodeIds.add(nodeId);
    }
  }
  return Array.from(nodeIds);
}

function retrieveCaseGraph({ query, propositionArtifactPath, taxonomyPath, filters = {}, topK = 5, publicDemoMode = true } = {}) {
  if (!query) throw new Error("query required");
  if (!propositionArtifactPath) throw new Error("propositionArtifactPath required");
  if (!taxonomyPath) throw new Error("taxonomyPath required");
  const artifact = JSON.parse(fs.readFileSync(propositionArtifactPath, "utf8"));
  const taxonomy = JSON.parse(fs.readFileSync(taxonomyPath, "utf8"));
  const likelyTreeNodeIds = classifyLikelyTreeNodes(query, taxonomy);
  const cards = (artifact.proposition_cards || []).filter(card => {
    if (publicDemoMode && (card.source_visibility !== "public_demo" || card.tenant_id !== "public")) return false;
    if (filters.tree_node_id && !(card.tree_node_ids || []).includes(filters.tree_node_id)) return false;
    if (filters.case_id && card.case_id !== filters.case_id) return false;
    if (filters.significance_label && card.significance_label !== filters.significance_label) return false;
    if (filters.authority_role && card.authority_role !== filters.authority_role) return false;
    if (filters.review_state && card.review_state !== filters.review_state) return false;
    return true;
  });
  const scored = cards
    .map(card => {
      const nodeBoost = likelyTreeNodeIds.some(nodeId => (card.tree_node_ids || []).includes(nodeId)) ? 2 : 0;
      const authorityPenalty = ["party_submission", "procedural_background"].includes(card.authority_role) ? -2 : 0;
      const reviewBoost = card.review_state === "answer_safe" ? 2 : card.review_state === "lawyer_reviewed" ? 1 : 0;
      return {
        ...card,
        retrieval_score: lexicalScore(query, card) + nodeBoost + authorityPenalty + reviewBoost,
      };
    })
    .sort((a, b) => b.retrieval_score - a.retrieval_score)
    .slice(0, topK);
  return {
    query,
    likely_tree_node_ids: likelyTreeNodeIds,
    filters,
    top_k: topK,
    returned_count: scored.length,
    source_artifact_id: artifact.artifact_id,
    hits: scored,
    warnings: scored.some(card => card.review_state !== "answer_safe")
      ? ["unreviewed_cards_are_research_only_not_final_law"]
      : [],
  };
}

module.exports = {
  classifyLikelyTreeNodes,
  lexicalScore,
  retrieveCaseGraph,
};
