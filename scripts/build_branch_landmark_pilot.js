#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");
const { buildBranchLandmarkPilotFromFile } = require("../src/case_graph/build_branch_landmark_pilot");
const { branchPilotDir } = require("../src/case_graph/branch_scale_readiness");

const ROOT = path.resolve(__dirname, "..");
const QUEUE_PATH = path.join(
  ROOT,
  "data",
  "legal_ingest",
  "criminal_evidence_tree_v1",
  "branch_pilot_queue.json",
);

function parseArgs(argv) {
  const args = { branch: "", noFetch: false };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--branch") args.branch = argv[++i] || "";
    else if (argv[i] === "--no-fetch") args.noFetch = true;
  }
  return args;
}

function resolveBranchDir(branchFamilyId) {
  const queue = JSON.parse(fs.readFileSync(QUEUE_PATH, "utf8"));
  const entry = (queue.branches || []).find(item => item.branch_family_id === branchFamilyId);
  if (entry?.pilot_dir) return path.join(ROOT, entry.pilot_dir);
  return branchPilotDir(branchFamilyId);
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.branch) throw new Error("--branch is required");

  const pilotDir = resolveBranchDir(args.branch);
  const configPath = path.join(pilotDir, "pilot_config.json");
  if (!fs.existsSync(configPath)) {
    throw new Error(`Missing pilot config: ${configPath}`);
  }

  const report = await buildBranchLandmarkPilotFromFile({
    configPath,
    outputDir: pilotDir,
    fetchSources: !args.noFetch,
  });
  console.log(JSON.stringify(report, null, 2));
}

main().catch(error => {
  if (error.report) console.error(JSON.stringify(error.report, null, 2));
  console.error(error.message);
  process.exit(1);
});
