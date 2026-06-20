const fs = require("fs");
const path = require("path");
const { localRerank } = require("../retrieval/rerank_adapter");

const ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_DOMAIN_DIR = path.join(ROOT, "data", "legal_domain_packs", "demo_maps", "criminal_procedure_hk");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function doctrineNodeIdFor(node, domainId) {
  if (node.doctrine_node_id) return node.doctrine_node_id;
  if (node.id && node.id.startsWith(`${domainId}.`)) return node.id;
  return `${domainId}.${node.id}`;
}

function loadDoctrineNodeCandidates(domainDir = DEFAULT_DOMAIN_DIR) {
  const manifest = readJson(path.join(domainDir, "consolidated.json"));
  const nodes = [];
  for (const section of manifest.sections || []) {
    const payload = readJson(path.join(domainDir, section.node_file));
    for (const node of payload.nodes || []) {
      const doctrine_node_id = doctrineNodeIdFor(node, "criminal_procedure_hk");
      nodes.push({
        doctrine_node_id,
        id: doctrine_node_id,
        label: node.label || node.title || doctrine_node_id,
        text: [
          doctrine_node_id,
          node.label,
          node.title,
          node.description,
          node.summary,
          ...(node.triggers || []),
          ...(node.keywords || []),
          ...(node.required_facts || []),
        ].filter(Boolean).join(" "),
      });
    }
  }
  return nodes;
}

function linkProposalToDoctrineNodes(proposal, {
  domainDir = DEFAULT_DOMAIN_DIR,
  limit = 5,
  minScore = 1,
  allowedNodeIds = [],
} = {}) {
  const candidates = loadDoctrineNodeCandidates(domainDir)
    .filter(node => !allowedNodeIds.length || allowedNodeIds.includes(node.doctrine_node_id));
  const query = [
    proposal.proposition_text,
    proposal.exact_quote,
    proposal.significance_label,
    proposal.authority_role,
  ].filter(Boolean).join(" ");
  const ranked = localRerank(query, candidates, { limit: Math.max(limit * 3, limit) })
    .filter(item => Number(item.rerank_score || 0) >= minScore)
    .slice(0, limit)
    .map(item => ({
      doctrine_node_id: item.doctrine_node_id,
      label: item.label,
      link_confidence: Number(Math.min(0.95, 0.45 + (Number(item.rerank_score || 0) * 0.08)).toFixed(2)),
      linker_score: item.rerank_score,
      linking_method: "local_lexical_doctrine_linker_v1",
      review_status: "machine_candidate",
      answer_layer_status: "candidate_only",
    }));
  return {
    proposal_id: proposal.proposal_id,
    query,
    candidate_count: candidates.length,
    links: ranked,
    status: ranked.length ? "candidate_links" : "no_candidate_link_abstain",
  };
}

module.exports = {
  DEFAULT_DOMAIN_DIR,
  doctrineNodeIdFor,
  linkProposalToDoctrineNodes,
  loadDoctrineNodeCandidates,
};
