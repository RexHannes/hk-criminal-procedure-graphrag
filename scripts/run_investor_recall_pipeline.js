#!/usr/bin/env node
/* eslint-disable no-console */

const { spawnSync } = require("child_process");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const args = {
    targetCases: 10000,
    skipHarvest: false,
  dryRunIndex: false,
  enrichHklii: false,
  maxRequests: Infinity,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--target-cases") args.targetCases = Number(argv[++i] || args.targetCases);
    else if (arg === "--skip-harvest") args.skipHarvest = true;
    else if (arg === "--dry-run-index") args.dryRunIndex = true;
    else if (arg === "--enrich-hklii") args.enrichHklii = true;
    else if (arg === "--max-requests") args.maxRequests = Number(argv[++i] || args.maxRequests);
  }
  return args;
}

function run(command, args) {
  const result = spawnSync(process.execPath, [path.join(ROOT, "scripts", command), ...args], {
    cwd: ROOT,
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

const args = parseArgs(process.argv);

if (!args.skipHarvest) {
  const harvestArgs = ["--target-cases", String(args.targetCases)];
  if (Number.isFinite(args.maxRequests)) harvestArgs.push("--max-requests", String(args.maxRequests));
  run("build_investor_recall_corpus.js", harvestArgs);
}

if (args.enrichHklii) run("enrich_investor_recall_hklii_paragraph_urls.js", []);
run("validate_investor_recall_corpus.js", ["--min-cards", "1"]);
run("index_investor_recall_qdrant.js", args.dryRunIndex ? ["--dry-run"] : []);
