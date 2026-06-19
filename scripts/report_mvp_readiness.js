#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const WEIGHTS_PATH = path.join(ROOT, "data", "legal_ingest", "mvp", "production_readiness_weights.json");

function loadWeights() {
  return JSON.parse(fs.readFileSync(WEIGHTS_PATH, "utf8"));
}

function weightedReadiness(weights) {
  const total = weights.gates.reduce((sum, gate) => sum + gate.weight, 0);
  const done = weights.gates.reduce((sum, gate) => sum + gate.weight * gate.done_ratio, 0);
  return Math.round((done / total) * 100);
}

function report() {
  const weights = loadWeights();
  const percent = weightedReadiness(weights);
  const gates = weights.gates.map(gate => ({
    gate_id: gate.gate_id,
    weight: gate.weight,
    current_state: gate.current_state,
    estimated_done_percent: Math.round(gate.done_ratio * 100),
    remaining: gate.remaining,
  }));
  return {
    readiness_id: weights.readiness_id,
    estimated_overall_done_percent: percent,
    practical_status: percent >= 80 ? "public_demo_close" : "local_demo_plus_scaffold",
    summary: "Local source-gated pilot is working; production HK-law Claude still needs corpus scale, real retrieval quality, review promotion, and private-source controls.",
    gates,
  };
}

if (require.main === module) {
  console.log(JSON.stringify(report(), null, 2));
}

module.exports = { report, weightedReadiness };
