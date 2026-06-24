#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PILOT_DIR = path.join(ROOT, "data", "legal_ingest", "tree_gap_pilots", "data_privacy_dpp1_v1");
const DOMAIN_DIR = path.join(ROOT, "data", "legal_domain_packs", "demo_maps", "data_privacy_hk");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function arrayFromPayload(payload, key) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.[key])) return payload[key];
  return [];
}

function loadDataPrivacyNodeIds() {
  const ids = new Set();
  const nodesDir = path.join(DOMAIN_DIR, "nodes");
  for (const file of fs.readdirSync(nodesDir).filter(name => name.endsWith(".json"))) {
    const payload = readJson(path.join(nodesDir, file));
    for (const node of payload.nodes || []) {
      if (node.doctrine_node_id) ids.add(node.doctrine_node_id);
      if (node.id) ids.add(node.id);
      if (node.id) ids.add(`data_privacy_hk.${node.id}`);
    }
  }
  return ids;
}

function main() {
  const manifest = readJson(path.join(PILOT_DIR, "source_manifest.json"));
  const parseReport = readJson(path.join(PILOT_DIR, "parse_report.json"));
  const paragraphPayload = readJson(path.join(PILOT_DIR, "paragraph_cards.json"));
  const paragraphs = arrayFromPayload(paragraphPayload, "paragraph_cards");
  const propositions = arrayFromPayload(readJson(path.join(PILOT_DIR, "proposition_cards.json")), "proposition_cards");
  const links = arrayFromPayload(readJson(path.join(PILOT_DIR, "proposition_node_links.json")), "proposition_node_links");
  const reviewItems = arrayFromPayload(readJson(path.join(PILOT_DIR, "review_queue.json")), "review_items");
  const knownNodeIds = loadDataPrivacyNodeIds();
  const paragraphById = new Map(paragraphs.map(item => [item.paragraph_id, item]));
  const propositionIds = new Set(propositions.map(item => item.proposition_id));
  const reviewIds = new Set(reviewItems.map(item => item.item_id));
  const errors = [];

  if (manifest.domain_id !== "data_privacy_hk") errors.push("manifest_domain_mismatch");
  if (manifest.source_policy?.public_sources_only !== true) errors.push("public_sources_only_required");
  if (manifest.source_policy?.private_or_licensed_sources_allowed !== false) errors.push("private_sources_must_be_blocked");
  if (manifest.source_policy?.answer_safe_by_default !== false) errors.push("answer_safe_by_default_must_be_false");
  if (parseReport.rejected_count !== 0) errors.push("parse_report_has_rejections");
  if (parseReport.proposition_count < 5) errors.push("too_few_propositions");

  for (const source of manifest.sources || []) {
    if (source.source_visibility !== "public_demo") errors.push(`${source.source_id}:bad_source_visibility`);
    if (source.tenant_id !== "public") errors.push(`${source.source_id}:bad_tenant`);
    if (source.licence_status !== "public_judgment") errors.push(`${source.source_id}:bad_license`);
    if (!/^https:\/\/www\.pcpd\.org\.hk\//.test(source.source_url_or_path || "")) errors.push(`${source.source_id}:unexpected_source_url`);
  }

  for (const paragraph of paragraphs) {
    if (!paragraph.source_url) errors.push(`${paragraph.paragraph_id}:missing_source_url`);
    if (!paragraph.paragraph_no) errors.push(`${paragraph.paragraph_id}:missing_paragraph_no`);
    if (!paragraph.text || paragraph.text.length < 60) errors.push(`${paragraph.paragraph_id}:paragraph_too_short`);
  }

  for (const card of propositions) {
    const paragraph = paragraphById.get(card.paragraph_id);
    if (!paragraph) errors.push(`${card.proposition_id}:missing_paragraph`);
    else if (!String(paragraph.text || "").includes(card.exact_quote)) errors.push(`${card.proposition_id}:exact_quote_not_found`);
    if (card.answer_safe === true || card.review_state === "answer_safe" || card.answer_layer_status === "answer_safe") {
      errors.push(`${card.proposition_id}:answer_safe_forbidden`);
    }
    if (!reviewIds.has(card.proposition_id)) errors.push(`${card.proposition_id}:missing_review_item`);
    for (const nodeId of card.target_doctrine_node_ids || []) {
      if (!knownNodeIds.has(nodeId)) errors.push(`${card.proposition_id}:unknown_doctrine_node:${nodeId}`);
    }
  }

  for (const link of links) {
    if (!propositionIds.has(link.proposition_id)) errors.push(`${link.link_id}:unknown_proposition`);
    if (!knownNodeIds.has(link.doctrine_node_id)) errors.push(`${link.link_id}:unknown_doctrine_node:${link.doctrine_node_id}`);
    if (link.answer_layer_status !== "candidate_only") errors.push(`${link.link_id}:not_candidate_only`);
    if (link.review_status !== "machine_candidate") errors.push(`${link.link_id}:unexpected_review_status`);
  }

  const report = {
    validator: "data_privacy_gap_pilot_v1",
    status: errors.length ? "failed" : "passed",
    source_count: manifest.sources?.length || 0,
    paragraph_count: paragraphs.length,
    proposition_count: propositions.length,
    link_count: links.length,
    review_item_count: reviewItems.length,
    errors,
  };
  console.log(JSON.stringify(report, null, 2));
  if (errors.length) process.exit(1);
}

main();
