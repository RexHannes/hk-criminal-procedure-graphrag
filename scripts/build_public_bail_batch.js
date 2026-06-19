#!/usr/bin/env node
/* eslint-disable no-console */

const path = require("path");
const { buildPublicBailBatch } = require("../src/case_graph/build_public_bail_batch");

const ROOT = path.resolve(__dirname, "..");
const BATCH = path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "bail_public_batch_v1");

buildPublicBailBatch({
  manifestPath: path.join(BATCH, "source_manifest.json"),
  rulesPath: path.join(BATCH, "extraction_rules.json"),
  outputDir: BATCH,
}).then(artifact => {
  if (artifact.errors.length) {
    console.error("Public bail batch built with fetch errors:");
    artifact.errors.forEach(error => console.error(`- ${error}`));
  }
  console.log(`Public bail batch built: ${artifact.source_count} sources, ${artifact.paragraph_count} paragraphs, ${artifact.proposition_count} propositions, ${artifact.link_count} links, ${artifact.rejected_count} rejected rules.`);
  if (artifact.proposition_count === 0) process.exit(1);
}).catch(error => {
  console.error(`Public bail batch build failed: ${error.message}`);
  process.exit(1);
});
