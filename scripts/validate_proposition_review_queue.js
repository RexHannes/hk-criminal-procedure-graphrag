#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const QUEUE_PATH = path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "fixtures", "sample_proposition_review_queue.json");
const queue = JSON.parse(fs.readFileSync(QUEUE_PATH, "utf8"));
const errors = [];

if (queue.queue_id !== "criminal_evidence_proposition_review_queue_v1") errors.push("unexpected queue_id");
if (!Array.isArray(queue.items) || queue.items.length < 8) errors.push("review queue should contain fixture proposition items");
for (const item of queue.items || []) {
  for (const field of ["item_id", "proposition_id", "case_id", "significance_label", "authority_role", "confidence", "review_state", "priority", "group_keys"]) {
    if (!item[field]) errors.push(`${item.item_id || "unknown"}:missing_${field}`);
  }
  if (item.human_review_required !== true) errors.push(`${item.item_id}:human_review_required_must_be_true`);
  if (!item.group_keys.by_tree_node || !item.group_keys.by_significance_label || !item.group_keys.by_case) {
    errors.push(`${item.item_id}:missing_group_keys`);
  }
}

if (errors.length) {
  console.error("Proposition review queue validation failed:");
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log("Proposition review queue validation passed.");
