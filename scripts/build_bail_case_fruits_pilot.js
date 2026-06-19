#!/usr/bin/env node
/* eslint-disable no-console */

const path = require("path");
const { buildBailCaseFruitLinks } = require("../src/case_graph/link_case_fruits_to_doctrine_tree");

const ROOT = path.resolve(__dirname, "..");
const BASE = path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1");
const PILOT = path.join(BASE, "bail_pilot");

const artifact = buildBailCaseFruitLinks({
  mappingPath: path.join(PILOT, "node_mapping.json"),
  propositionArtifactPath: path.join(BASE, "fixtures", "sample_proposition_cards.attached.json"),
  paragraphArtifactPath: path.join(BASE, "fixtures", "sample_paragraph_cards.json"),
  outputDir: PILOT,
});

if (artifact.errors.length) {
  console.error("Bail case fruits pilot build failed:");
  artifact.errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`Bail case fruits pilot built: ${artifact.proposition_node_links.length} links, ${artifact.l4_case_applications.length} L4 applications, ${artifact.l5_paragraph_proof.length} L5 proof cards.`);
