#!/usr/bin/env node
/* eslint-disable no-console */

const { evaluateBranchScaleReadiness } = require("../src/case_graph/branch_scale_readiness");

function parseArgs(argv) {
  const args = {
    tier: "",
    branch: "",
    targetCases: 0,
    requireGreen: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--tier") args.tier = argv[++i] || "";
    else if (arg === "--branch") args.branch = argv[++i] || "";
    else if (arg === "--target-cases") args.targetCases = Number(argv[++i] || 0);
    else if (arg === "--require-green") args.requireGreen = true;
  }
  return args;
}

const args = parseArgs(process.argv);
const report = evaluateBranchScaleReadiness({
  tierId: args.tier,
  targetCases: args.targetCases || undefined,
  branchFamilyId: args.branch,
});
console.log(JSON.stringify(report, null, 2));

if (args.requireGreen && !report.execution_allowed) {
  process.exit(1);
}
