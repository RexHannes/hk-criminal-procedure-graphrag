#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const WEIGHTS_PATH = path.join(ROOT, "data", "legal_ingest", "mvp", "production_readiness_weights.json");

function loadWeights() {
  return JSON.parse(fs.readFileSync(WEIGHTS_PATH, "utf8"));
}

function readinessItems(weights) {
  return weights.sections || weights.gates || [];
}

function itemId(item) {
  return item.section_id || item.gate_id;
}

function weightedReadiness(weights) {
  const items = readinessItems(weights);
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  const done = items.reduce((sum, item) => sum + item.weight * item.done_ratio, 0);
  return Math.round((done / total) * 100);
}

function report() {
  const weights = loadWeights();
  const percent = weightedReadiness(weights);
  const sections = readinessItems(weights).map(item => ({
    section_id: itemId(item),
    weight: item.weight,
    current_state: item.current_state,
    estimated_done_percent: Math.round(item.done_ratio * 100),
    evidence: item.evidence || [],
    remaining: item.remaining,
  }));
  return {
    readiness_id: weights.readiness_id,
    estimated_overall_done_percent: percent,
    practical_status: percent >= 80 ? "public_demo_close" : "local_demo_plus_scaffold",
    production_readiness_estimate: percent >= 80 ? "near_public_demo_quality_gate" : "not_production_ready",
    summary: "v0.5 has stronger public-corpus, retrieval-benchmark, review, and source-gated answer plumbing; production HK-law Claude still needs corpus scale, real embeddings/reranking, review promotion, and private-source access controls.",
    warning: weights.overall_warning || "Readiness percentages are engineering estimates, not legal validation.",
    sections,
    gates: sections.map(section => ({
      gate_id: section.section_id,
      weight: section.weight,
      current_state: section.current_state,
      estimated_done_percent: section.estimated_done_percent,
      remaining: section.remaining,
    })),
    key_remaining_blockers: sections
      .filter(section => section.estimated_done_percent < 70)
      .map(section => `${section.section_id}: ${section.remaining}`),
  };
}

if (require.main === module) {
  console.log(JSON.stringify(report(), null, 2));
}

module.exports = { report, weightedReadiness };
