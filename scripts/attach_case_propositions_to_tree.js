#!/usr/bin/env node
/* eslint-disable no-console */

const path = require("path");
const { attachPropositionsToTree } = require("../src/case_graph/attach_propositions_to_tree");

const ROOT = path.resolve(__dirname, "..");
const BASE = path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1");
const result = attachPropositionsToTree({
  propositionArtifactPath: path.join(BASE, "fixtures", "sample_proposition_cards.json"),
  paragraphArtifactPath: path.join(BASE, "fixtures", "sample_paragraph_cards.json"),
  doctrineTreePath: path.join(BASE, "doctrine_tree.json"),
  procedureTreePath: path.join(BASE, "procedure_tree.json"),
  taxonomyPath: path.join(BASE, "evidence_taxonomy.json"),
  outputPath: path.join(BASE, "fixtures", "sample_proposition_cards.attached.json"),
});

if (result.errors.length) {
  console.error("Tree attachment failed:");
  result.errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}
console.log(`Tree attachment passed: ${result.proposition_count} propositions attached to ${result.tree_node_count} nodes.`);
