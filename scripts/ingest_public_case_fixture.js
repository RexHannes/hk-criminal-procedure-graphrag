#!/usr/bin/env node
/* eslint-disable no-console */

const path = require("path");
const { ingestCasesToParagraphs } = require("../src/case_graph/ingest_case_to_paragraphs");

const ROOT = path.resolve(__dirname, "..");
const FIXTURE = path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "fixtures", "sample_cases.json");
const OUTPUT = path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "fixtures", "sample_paragraph_cards.json");

const result = ingestCasesToParagraphs({ fixturePath: FIXTURE, outputPath: OUTPUT });
if (result.errors.length) {
  console.error("Case fixture ingestion failed:");
  result.errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}
console.log(`Case fixture ingestion passed: ${result.case_count} cases, ${result.paragraph_count} paragraphs.`);
