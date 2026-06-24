#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const QUEUE = path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "landmark_first_expansion_queue.json");
const DOMAIN_ROOT = path.join(ROOT, "data", "legal_domain_packs", "demo_maps");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizeNodeId(node, domainId) {
  if (node.doctrine_node_id) return node.doctrine_node_id;
  if (node.id && node.id.startsWith(`${domainId}.`)) return node.id;
  return `${domainId}.${node.id}`;
}

function collectKnownNodeIds() {
  const ids = new Set();
  for (const domainId of ["criminal_law_hk", "criminal_procedure_hk"]) {
    const nodesDir = path.join(DOMAIN_ROOT, domainId, "nodes");
    for (const file of fs.readdirSync(nodesDir).filter(name => name.endsWith(".json"))) {
      const payload = readJson(path.join(nodesDir, file));
      for (const node of payload.nodes || []) ids.add(normalizeNodeId(node, domainId));
    }
  }
  return ids;
}

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

function main() {
  const queue = readJson(QUEUE);
  const knownNodeIds = collectKnownNodeIds();
  const errors = [];
  const queueItems = queue.next_priority_queue || [];
  const coveredItems = queue.covered_or_anchor_items || [];
  const allItems = [...queueItems, ...coveredItems];

  assert(queue.queue_id === "criminal_landmark_first_expansion_queue_v1", "unexpected queue_id", errors);
  assert(queue.status === "candidate_only_scale_preparation_not_bulk_execution", "queue must be preparation-only", errors);
  assert(queue.source_policy?.notebooklm_role === "candidate_tree_and_landmark_lineage_proposer_only", "NotebookLM must remain proposal-only", errors);
  assert(queue.source_policy?.deepseek_role === "secondary_case_seed_or_extraction_rule_proposer_only", "DeepSeek must remain secondary-only", errors);
  assert(queue.source_policy?.public_sources_required === true, "public source lookup must be required", errors);
  assert(queue.source_policy?.exact_quote_required === true, "exact quote validation must be required", errors);
  assert(queue.source_policy?.bulk_auto_attach_allowed === false, "bulk auto attach must be blocked", errors);
  assert(queue.source_policy?.answer_safe_by_default === false, "answer_safe by default must be false", errors);
  assert(queue.source_policy?.private_book_text_allowed_in_public_artifacts === false, "private book text must be blocked", errors);
  assert(queue.scale_policy?.target_10000_case_run_status === "blocked_until_scale_readiness_green", "10k run must be blocked by readiness", errors);
  assert(queue.coverage_summary?.total_nodes >= 300, "expected criminal law/procedure tree nodes", errors);
  assert(queue.coverage_summary?.nodes_with_candidate_fruits >= 10, "expected existing candidate fruit coverage", errors);
  assert(queueItems.length > 0, "expected queued empty branches", errors);
  assert((queue.branch_family_queue || []).some(item => item.branch_family === "theft_dishonesty_fraud"), "missing theft/dishonesty branch family", errors);
  assert((queue.branch_family_queue || []).some(item => item.branch_family === "investigation_arrest_search_detention"), "missing investigation/search branch family", errors);

  for (const item of allItems) {
    assert(knownNodeIds.has(item.doctrine_node_id), `${item.queue_item_id}: unknown doctrine_node_id ${item.doctrine_node_id}`, errors);
    assert(item.public_source_required === true, `${item.queue_item_id}: public source not required`, errors);
    assert(item.exact_quote_required === true, `${item.queue_item_id}: exact quote not required`, errors);
    assert(item.allowed_status === "machine_candidate", `${item.queue_item_id}: allowed status must be machine_candidate`, errors);
    assert(item.answer_safe_allowed === false, `${item.queue_item_id}: answer_safe must be blocked`, errors);
    assert(!/answer_safe|lawyer_reviewed|approved/i.test(item.recommended_action || ""), `${item.queue_item_id}: action suggests promotion`, errors);
  }

  const report = {
    validator: "criminal_landmark_expansion_queue_v1",
    status: errors.length ? "failed" : "passed",
    coverage_summary: queue.coverage_summary,
    checked_items: allItems.length,
    top_branch_families: (queue.branch_family_queue || []).slice(0, 6).map(item => ({
      branch_family: item.branch_family,
      priority: item.priority,
      queued_node_count: item.queued_node_count,
    })),
    errors,
  };
  console.log(JSON.stringify(report, null, 2));
  if (errors.length) process.exit(1);
}

main();
