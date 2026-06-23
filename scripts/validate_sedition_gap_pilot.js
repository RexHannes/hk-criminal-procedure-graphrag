#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PILOT_DIR = path.join(
  ROOT,
  "data",
  "legal_ingest",
  "criminal_evidence_tree_v1",
  "tree_gap_pilots",
  "sedition_public_expression_v1",
);
const DOMAIN_DIR = path.join(ROOT, "data", "legal_domain_packs", "demo_maps", "criminal_law_hk");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function collectCriminalLawNodeIds() {
  const manifest = readJson(path.join(DOMAIN_DIR, "consolidated.json"));
  const ids = new Set();
  for (const section of manifest.sections || []) {
    const nodeFile = section.node_file || section.file;
    if (!nodeFile) continue;
    const payload = readJson(path.join(DOMAIN_DIR, nodeFile));
    for (const node of payload.nodes || []) {
      if (node.doctrine_node_id) ids.add(node.doctrine_node_id);
      else if (node.id) ids.add(`criminal_law_hk.${node.id}`);
    }
  }
  return ids;
}

const manifest = readJson(path.join(PILOT_DIR, "source_manifest.json"));
const paragraphsPayload = readJson(path.join(PILOT_DIR, "paragraph_cards.json"));
const propositionsPayload = readJson(path.join(PILOT_DIR, "proposition_cards.json"));
const linksPayload = readJson(path.join(PILOT_DIR, "proposition_node_links.json"));
const treeProposal = readJson(path.join(PILOT_DIR, "notebooklm_tree_proposal.json"));
const nodeIds = collectCriminalLawNodeIds();
const paragraphById = new Map((paragraphsPayload.paragraph_cards || []).map(item => [item.paragraph_id, item]));
const propositionIds = new Set((propositionsPayload.proposition_cards || []).map(item => item.proposition_id));
const errors = [];

if (manifest.batch_id !== "sedition_public_expression_tree_gap_pilot_v1") errors.push("unexpected_batch_id");
if (manifest.tree_gap_resolution?.existing_tree_match !== "no_clean_existing_branch") errors.push("tree_gap_resolution_missing");
if (treeProposal.proposal_status !== "candidate_only_requires_public_source_verification") errors.push("tree_proposal_not_candidate_only");

for (const source of manifest.sources || []) {
  if (source.source_visibility !== "public_demo") errors.push(`${source.source_id}:source_visibility_not_public_demo`);
  if (source.tenant_id !== "public") errors.push(`${source.source_id}:tenant_not_public`);
  if (source.licence_status !== "public_judgment") errors.push(`${source.source_id}:not_public_judgment`);
}

for (const card of propositionsPayload.proposition_cards || []) {
  const paragraph = paragraphById.get(card.paragraph_id);
  if (!paragraph) errors.push(`${card.proposition_id}:missing_paragraph`);
  else if (!paragraph.text.includes(card.exact_quote)) errors.push(`${card.proposition_id}:exact_quote_not_found`);
  if (card.answer_safe === true || card.review_state === "answer_safe") errors.push(`${card.proposition_id}:auto_answer_safe_forbidden`);
  if (card.source_visibility !== "public_demo" || card.tenant_id !== "public") errors.push(`${card.proposition_id}:bad_visibility`);
  for (const nodeId of card.target_doctrine_node_ids || []) {
    if (!nodeIds.has(nodeId)) errors.push(`${card.proposition_id}:unknown_node:${nodeId}`);
  }
}

for (const link of linksPayload.proposition_node_links || []) {
  if (!propositionIds.has(link.proposition_id)) errors.push(`${link.link_id}:unknown_proposition`);
  if (!nodeIds.has(link.doctrine_node_id)) errors.push(`${link.link_id}:unknown_doctrine_node`);
  if (link.review_status !== "machine_candidate") errors.push(`${link.link_id}:review_status_not_candidate`);
  if (link.answer_layer_status !== "candidate_only") errors.push(`${link.link_id}:answer_layer_not_candidate_only`);
}

const report = {
  validator: "sedition_public_expression_gap_pilot_v1",
  batch_id: manifest.batch_id,
  source_count: (manifest.sources || []).length,
  paragraph_count: (paragraphsPayload.paragraph_cards || []).length,
  proposition_count: (propositionsPayload.proposition_cards || []).length,
  link_count: (linksPayload.proposition_node_links || []).length,
  status: errors.length ? "failed" : "passed",
  errors,
};

console.log(JSON.stringify(report, null, 2));
if (errors.length) process.exit(1);
