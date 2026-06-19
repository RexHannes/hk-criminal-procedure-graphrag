#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");
const { validatePropositionCard } = require("../src/case_graph/proposition_card_schema");
const { validateParagraphCard } = require("../src/case_graph/case_card_schema");

const ROOT = path.resolve(__dirname, "..");
const BASE = path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1");

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(BASE, rel), "utf8"));
}

const doctrine = readJson("doctrine_tree.json");
const procedure = readJson("procedure_tree.json");
const labels = readJson("significance_labels.json");
const paragraphs = readJson("fixtures/sample_paragraph_cards.json");
const propositions = readJson("fixtures/sample_proposition_cards.attached.json");
const nodeIds = new Set([...(doctrine.nodes || []), ...(procedure.nodes || [])].map(node => node.node_id));
const labelSet = new Set((labels.labels || []).map(label => label.label));
const paragraphById = new Map((paragraphs.paragraph_cards || []).map(paragraph => [paragraph.paragraph_id, paragraph]));
const errors = [];

for (const paragraph of paragraphs.paragraph_cards || []) {
  errors.push(...validateParagraphCard(paragraph).map(error => `${paragraph.paragraph_id}:${error}`));
}

for (const card of propositions.proposition_cards || []) {
  errors.push(...validatePropositionCard(card, paragraphById, nodeIds).map(error => `${card.proposition_id}:${error}`));
  if (!labelSet.has(card.significance_label)) errors.push(`${card.proposition_id}:unknown_significance_label`);
  if (card.authority_role === "party_submission" && card.significance_label === "states_rule") {
    errors.push(`${card.proposition_id}:party_submission_labelled_states_rule`);
  }
  if (card.answer_safe && card.review_state !== "answer_safe") {
    errors.push(`${card.proposition_id}:answer_safe_without_review`);
  }
  if (card.source_visibility !== "public_demo" || card.tenant_id !== "public") {
    errors.push(`${card.proposition_id}:private_or_wrong_tenant_leakage`);
  }
}

if (errors.length) {
  console.error("Case graph significance validation failed:");
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log("Case graph significance validation passed.");
