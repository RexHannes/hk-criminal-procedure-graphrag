#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DOMAINS_DIR = path.join(ROOT, "data", "legal_domain_packs", "demo_maps");
const QUEUE_PATH = path.join(
  ROOT,
  "data",
  "legal_ingest",
  "criminal_evidence_tree_v1",
  "branch_pilot_queue.json",
);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function arrayFromPayload(payload, key) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.[key])) return payload[key];
  return [];
}

function parseArgs(argv) {
  const args = { branch: "" };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--branch") args.branch = argv[++i] || "";
  }
  return args;
}

function loadAllDoctrineNodeIds() {
  const ids = new Set();
  if (!fs.existsSync(DOMAINS_DIR)) return ids;
  for (const domain of fs.readdirSync(DOMAINS_DIR)) {
    const nodesDir = path.join(DOMAINS_DIR, domain, "nodes");
    if (!fs.existsSync(nodesDir)) continue;
    for (const file of fs.readdirSync(nodesDir).filter(name => name.endsWith(".json"))) {
      const payload = readJson(path.join(nodesDir, file));
      for (const node of payload.nodes || []) {
        if (node.doctrine_node_id) ids.add(node.doctrine_node_id);
        if (node.id) ids.add(node.id);
        if (node.id && domain) ids.add(`${domain}.${node.id}`);
      }
    }
  }
  return ids;
}

function resolvePilotDir(branchFamilyId) {
  const queue = readJson(QUEUE_PATH);
  const entry = (queue.branches || []).find(item => item.branch_family_id === branchFamilyId);
  if (entry?.pilot_dir) return path.join(ROOT, entry.pilot_dir);
  return path.join(
    ROOT,
    "data",
    "legal_ingest",
    "criminal_evidence_tree_v1",
    "branch_pilots",
    `${branchFamilyId}_v1`,
  );
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.branch) throw new Error("--branch is required");

  const pilotDir = resolvePilotDir(args.branch);
  const manifest = readJson(path.join(pilotDir, "source_manifest.json"));
  const parseReport = readJson(path.join(pilotDir, "parse_report.json"));
  const paragraphs = arrayFromPayload(readJson(path.join(pilotDir, "paragraph_cards.json")), "paragraph_cards");
  const propositions = arrayFromPayload(readJson(path.join(pilotDir, "proposition_cards.json")), "proposition_cards");
  const links = arrayFromPayload(readJson(path.join(pilotDir, "proposition_node_links.json")), "proposition_node_links");
  const reviewQueue = readJson(path.join(pilotDir, "review_queue.json"));
  const paragraphById = new Map(paragraphs.map(item => [item.paragraph_id, item]));
  const knownNodeIds = loadAllDoctrineNodeIds();
  const errors = [];

  if (manifest.branch_family_id !== args.branch) errors.push("branch_family_id_mismatch");
  if (manifest.source_policy?.public_sources_only !== true) errors.push("public_sources_only_required");
  if (manifest.source_policy?.private_or_licensed_sources_allowed !== false) errors.push("private_sources_must_be_blocked");
  if (manifest.source_policy?.answer_safe_by_default !== false) errors.push("answer_safe_by_default_must_be_false");
  if (manifest.scale_policy?.large_cross_domain_crawl_allowed !== false) errors.push("large_cross_domain_crawl_must_be_blocked");
  if (parseReport.rejected_count !== 0) errors.push("parse_report_has_rejections");
  if (!Array.isArray(reviewQueue.review_items) || reviewQueue.review_items.length !== propositions.length) {
    errors.push("review_queue_count_mismatch");
  }

  for (const source of manifest.sources || []) {
    if (source.source_visibility !== "public_demo") errors.push(`${source.source_id}:bad_source_visibility`);
    if (source.tenant_id !== "public") errors.push(`${source.source_id}:bad_tenant`);
    if (source.licence_status !== "public_judgment") errors.push(`${source.source_id}:bad_license`);
  }

  for (const card of propositions) {
    const paragraph = paragraphById.get(card.paragraph_id);
    if (!paragraph) errors.push(`${card.proposition_id}:missing_paragraph`);
    else if (!String(paragraph.text || "").includes(card.exact_quote)) {
      errors.push(`${card.proposition_id}:exact_quote_not_found`);
    }
    if (card.answer_safe === true || card.review_state === "answer_safe" || card.answer_layer_status === "answer_safe") {
      errors.push(`${card.proposition_id}:answer_safe_forbidden`);
    }
    for (const nodeId of card.target_doctrine_node_ids || []) {
      if (!knownNodeIds.has(nodeId)) errors.push(`${card.proposition_id}:unknown_doctrine_node:${nodeId}`);
    }
  }

  for (const link of links) {
    if (!knownNodeIds.has(link.doctrine_node_id)) errors.push(`${link.link_id}:unknown_doctrine_node:${link.doctrine_node_id}`);
    if (link.answer_layer_status !== "candidate_only") errors.push(`${link.link_id}:not_candidate_only`);
  }

  const report = {
    validator: "branch_landmark_pilot_validator_v1",
    branch_family_id: args.branch,
    batch_id: manifest.batch_id,
    source_count: manifest.sources?.length || 0,
    paragraph_count: paragraphs.length,
    proposition_count: propositions.length,
    link_count: links.length,
    review_item_count: reviewQueue.review_items?.length || 0,
    status: errors.length ? "failed" : "passed",
    errors,
  };
  console.log(JSON.stringify(report, null, 2));
  if (errors.length) process.exit(1);
}

main();
