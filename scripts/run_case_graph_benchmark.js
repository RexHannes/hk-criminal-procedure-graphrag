#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");
const { retrieveCaseGraph } = require("../src/case_graph/retrieve_case_graph");

const ROOT = path.resolve(__dirname, "..");
const BASE = path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1");
const BENCHMARK = path.join(BASE, "case_graph_benchmark_queries.json");
const PROPOSITIONS = path.join(BASE, "fixtures", "sample_proposition_cards.attached.json");
const TAXONOMY = path.join(BASE, "evidence_taxonomy.json");

function intersects(left = [], right = []) {
  const set = new Set(left);
  return right.some(item => set.has(item));
}

function evaluateQuery(query) {
  const result = retrieveCaseGraph({
    query: query.query,
    propositionArtifactPath: PROPOSITIONS,
    taxonomyPath: TAXONOMY,
    topK: 5,
  });
  const expectedNodeIds = query.expected_tree_node_ids_any || [];
  const expectedLabels = query.expected_significance_labels_any || [];
  const relevantHits = result.hits.filter(hit => {
    const nodeOk = !expectedNodeIds.length || intersects(hit.tree_node_ids || [], expectedNodeIds);
    const labelOk = !expectedLabels.length || expectedLabels.includes(hit.significance_label);
    return nodeOk && labelOk;
  });
  const usableHits = relevantHits.filter(hit => !(query.must_not_use_labels || []).includes(hit.significance_label));
  const labels = usableHits.map(hit => hit.significance_label);
  const nodes = usableHits.flatMap(hit => hit.tree_node_ids || []);
  const forbiddenUsed = relevantHits.some(hit => (query.must_not_use_labels || []).includes(hit.significance_label));
  const hitNodes = !expectedNodeIds.length || intersects(nodes, expectedNodeIds);
  const hitLabels = !expectedLabels.length || intersects(labels, expectedLabels);
  const answerable = usableHits.some(hit => !["not_authority_party_argument", "procedural_history_only", "irrelevant"].includes(hit.significance_label));
  const behaviorOk = query.expected_behavior === "cannot_verify" ? !answerable : answerable;
  const passed = query.expected_behavior === "cannot_verify"
    ? hitNodes && hitLabels && behaviorOk
    : hitNodes && hitLabels && !forbiddenUsed && behaviorOk;
  return {
    id: query.id,
    passed,
    hit_nodes: hitNodes,
    hit_labels: hitLabels,
    forbidden_label_used: forbiddenUsed,
    behavior_ok: behaviorOk,
    returned_count: result.returned_count,
    top_hit: usableHits[0]?.proposition_id || result.hits[0]?.proposition_id || "",
    likely_tree_node_ids: result.likely_tree_node_ids,
  };
}

function runBenchmark() {
  const suite = JSON.parse(fs.readFileSync(BENCHMARK, "utf8"));
  const results = (suite.queries || []).map(evaluateQuery);
  const passed = results.filter(result => result.passed).length;
  const hitRate = results.length ? Number((passed / results.length).toFixed(3)) : 0;
  const report = {
    suite_id: suite.suite_id,
    query_count: results.length,
    passed,
    hit_rate: hitRate,
    quality_floor: suite.quality_floor,
    quality_status: hitRate >= suite.quality_floor.min_hit_rate ? "case_graph_fixture_quality_floor_satisfied" : "case_graph_needs_more_fixture_or_tree_work",
    results,
  };
  return report;
}

if (require.main === module) {
  const report = runBenchmark();
  console.log(JSON.stringify(report, null, 2));
  if (report.quality_status !== "case_graph_fixture_quality_floor_satisfied") process.exit(1);
}

module.exports = {
  runBenchmark,
};
