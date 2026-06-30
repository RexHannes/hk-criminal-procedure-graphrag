#!/usr/bin/env node
/* eslint-disable no-console */

const { spawnSync } = require("child_process");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const args = {
    targetCases: 25000,
    disStart: 100000,
    disEnd: 360000,
    concurrency: 16,
    skipHarvest: false,
    skipIndex: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--target-cases") args.targetCases = Number(argv[++i]);
    else if (arg === "--dis-start") args.disStart = Number(argv[++i]);
    else if (arg === "--dis-end") args.disEnd = Number(argv[++i]);
    else if (arg === "--concurrency") args.concurrency = Number(argv[++i]);
    else if (arg === "--skip-harvest") args.skipHarvest = true;
    else if (arg === "--skip-index") args.skipIndex = true;
  }
  return args;
}

function runNode(script, extraArgs = []) {
  const result = spawnSync(process.execPath, [path.join(ROOT, "scripts", script), ...extraArgs], {
    cwd: ROOT,
    encoding: "utf8",
    env: process.env,
  });
  return { script, ok: result.status === 0, status: result.status, stdout: result.stdout, stderr: result.stderr };
}

const args = parseArgs(process.argv);
const steps = [];

if (!args.skipHarvest) {
  steps.push(runNode("build_investor_recall_corpus.js", [
    "--target-cases", String(args.targetCases),
    "--dis-start", String(args.disStart),
    "--dis-end", String(args.disEnd),
    "--concurrency", String(args.concurrency),
  ]));
}

steps.push(runNode("build_case_scale_registry.js", ["--target-cases", String(args.targetCases)]));

if (!args.skipIndex) {
  steps.push(runNode("index_investor_recall_corpus_qdrant.js", []));
}

steps.push(runNode("run_retrieval_benchmark.js", [
  "--suite", "data/legal_ingest/mvp/retrieval_benchmark_criminal_recall_v1.json",
]));

const failed = steps.filter(step => !step.ok);
console.log(JSON.stringify({
  pipeline: "investor_recall_pipeline_v1",
  target_cases: args.targetCases,
  steps: steps.map(step => ({ script: step.script, ok: step.ok, status: step.status })),
  status: failed.length ? "failed" : "completed",
}, null, 2));

if (failed.length) {
  console.error(failed[0].stderr || failed[0].stdout);
  process.exit(1);
}
