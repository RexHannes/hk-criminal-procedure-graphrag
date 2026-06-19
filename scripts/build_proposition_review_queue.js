#!/usr/bin/env node
/* eslint-disable no-console */

const path = require("path");
const { buildPropositionReviewQueue } = require("../src/case_graph/proposition_review_queue");

const ROOT = path.resolve(__dirname, "..");
const BASE = path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1");
const result = buildPropositionReviewQueue({
  propositionArtifactPath: path.join(BASE, "fixtures", "sample_proposition_cards.attached.json"),
  outputPath: path.join(BASE, "fixtures", "sample_proposition_review_queue.json"),
});

console.log(`Proposition review queue built: ${result.item_count} items.`);
