const fs = require("fs");
const path = require("path");
const { propositionCard, validatePropositionCard } = require("./proposition_card_schema");

function loadTreeNodes(treePaths = []) {
  const nodes = [];
  for (const treePath of treePaths) {
    const tree = JSON.parse(fs.readFileSync(treePath, "utf8"));
    nodes.push(...(tree.nodes || []));
  }
  return nodes;
}

function inferTreeNodes(proposition, taxonomy) {
  const text = `${proposition.proposition_text} ${proposition.exact_quote}`.toLowerCase();
  const matches = new Set(proposition.tree_node_ids || []);
  for (const family of taxonomy.families || []) {
    if ((family.keywords || []).some(keyword => text.includes(String(keyword).toLowerCase()))) {
      for (const nodeId of family.tree_node_ids || []) matches.add(nodeId);
    }
  }
  if (!matches.size && proposition.significance_label !== "irrelevant") matches.add("unattached");
  return Array.from(matches);
}

function attachPropositionsToTree(input = {}) {
  const { propositionArtifactPath, paragraphArtifactPath, doctrineTreePath, procedureTreePath, taxonomyPath, outputPath } = input;
  for (const required of ["propositionArtifactPath", "paragraphArtifactPath", "doctrineTreePath", "procedureTreePath", "taxonomyPath"]) {
    if (!input[required]) throw new Error(`${required} required`);
  }
  const propositions = JSON.parse(fs.readFileSync(propositionArtifactPath, "utf8"));
  const paragraphs = JSON.parse(fs.readFileSync(paragraphArtifactPath, "utf8"));
  const taxonomy = JSON.parse(fs.readFileSync(taxonomyPath, "utf8"));
  const treeNodes = loadTreeNodes([doctrineTreePath, procedureTreePath]);
  const nodeIds = new Set(treeNodes.map(node => node.node_id));
  const paragraphById = new Map((paragraphs.paragraph_cards || []).map(paragraph => [paragraph.paragraph_id, paragraph]));
  const errors = [];
  const attached = [];

  for (const rawCard of propositions.proposition_cards || []) {
    const treeNodeIds = inferTreeNodes(rawCard, taxonomy);
    const reviewState = treeNodeIds.includes("unattached") || rawCard.confidence === "low"
      ? "machine_candidate"
      : rawCard.review_state || "machine_candidate";
    const card = propositionCard({
      ...rawCard,
      tree_node_ids: treeNodeIds,
      review_state: reviewState,
      human_review_required: true,
    });
    errors.push(...validatePropositionCard(card, paragraphById, nodeIds).map(error => `${card.proposition_id}:${error}`));
    attached.push(card);
  }

  const result = {
    artifact_id: "criminal_evidence_tree_attached_propositions_v1",
    generated_at: new Date().toISOString(),
    proposition_count: attached.length,
    tree_node_count: nodeIds.size,
    proposition_cards: attached,
    errors,
  };

  if (outputPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  }
  return result;
}

module.exports = {
  attachPropositionsToTree,
  inferTreeNodes,
  loadTreeNodes,
};
