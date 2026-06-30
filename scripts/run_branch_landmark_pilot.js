#!/usr/bin/env node
/* eslint-disable no-console */

const { spawnSync } = require("child_process");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const args = { branch: "" };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--branch") args.branch = argv[++i] || "";
  }
  return args;
}

function runNode(script, extraArgs = []) {
  const result = spawnSync(process.execPath, [path.join(ROOT, script), ...extraArgs], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

const args = parseArgs(process.argv);
if (!args.branch) {
  console.error("--branch is required");
  process.exit(1);
}

runNode("scripts/build_branch_landmark_pilot.js", ["--branch", args.branch]);
runNode("scripts/validate_branch_landmark_pilot.js", ["--branch", args.branch]);
runNode("scripts/validate_branch_scale_readiness.js", [
  "--tier",
  "branch_landmark_pilot",
  "--branch",
  args.branch,
  "--require-green",
]);
