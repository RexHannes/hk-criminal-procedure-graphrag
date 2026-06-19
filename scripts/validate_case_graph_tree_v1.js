#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const BASE = path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1");
const REQUIRED_DOCTRINE_NODES = [
  "criminal_evidence.pleadings",
  "criminal_evidence.burden_of_proof",
  "criminal_evidence.standard_of_proof",
  "criminal_evidence.admissibility",
  "criminal_evidence.confession",
  "criminal_evidence.voir_dire",
  "criminal_evidence.identification_evidence",
  "criminal_evidence.hearsay",
  "criminal_evidence.similar_fact",
  "criminal_evidence.right_to_silence",
  "criminal_evidence.abuse_of_process",
  "criminal_evidence.delay",
  "criminal_evidence.bail",
  "criminal_evidence.appeal_review",
  "criminal_evidence.judicial_discretion",
];

function read(name) {
  return JSON.parse(fs.readFileSync(path.join(BASE, name), "utf8"));
}

const doctrine = read("doctrine_tree.json");
const procedure = read("procedure_tree.json");
const taxonomy = read("evidence_taxonomy.json");
const labels = read("significance_labels.json");
const errors = [];
const doctrineIds = new Set((doctrine.nodes || []).map(node => node.node_id));
const allNodeIds = new Set([...(doctrine.nodes || []), ...(procedure.nodes || [])].map(node => node.node_id));

for (const required of REQUIRED_DOCTRINE_NODES) {
  if (!doctrineIds.has(required)) errors.push(`missing doctrine node ${required}`);
}
for (const node of [...(doctrine.nodes || []), ...(procedure.nodes || [])]) {
  for (const field of ["node_id", "label", "description", "allowed_source_kinds"]) {
    if (!node[field]) errors.push(`${node.node_id || "unknown"}:missing_${field}`);
  }
  if (node.review_required !== true) errors.push(`${node.node_id}:review_required_must_be_true`);
  if (node.parent_id && !allNodeIds.has(node.parent_id)) errors.push(`${node.node_id}:unknown_parent:${node.parent_id}`);
}
for (const family of taxonomy.families || []) {
  if (!(family.tree_node_ids || []).every(nodeId => allNodeIds.has(nodeId))) {
    errors.push(`${family.family_id}:unknown_taxonomy_node`);
  }
}
for (const label of ["states_rule", "applies_rule", "not_authority_party_argument", "procedural_history_only", "irrelevant"]) {
  if (!(labels.labels || []).some(item => item.label === label)) errors.push(`missing significance label ${label}`);
}

if (errors.length) {
  console.error("Doctrine/procedure tree validation failed:");
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log("Doctrine/procedure tree validation passed.");
