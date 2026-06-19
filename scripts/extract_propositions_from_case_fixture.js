#!/usr/bin/env node
/* eslint-disable no-console */

const path = require("path");
const { extractCandidatePropositions } = require("../src/case_graph/extract_candidate_propositions");

const ROOT = path.resolve(__dirname, "..");
const BASE = path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1");
const result = extractCandidatePropositions({
  fixturePath: path.join(BASE, "fixtures", "sample_cases.json"),
  paragraphArtifactPath: path.join(BASE, "fixtures", "sample_paragraph_cards.json"),
  outputPath: path.join(BASE, "fixtures", "sample_proposition_cards.json"),
});

if (result.errors.length) {
  console.error("Candidate proposition extraction failed:");
  result.errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}
console.log(`Candidate proposition extraction passed: ${result.proposition_count} propositions.`);
