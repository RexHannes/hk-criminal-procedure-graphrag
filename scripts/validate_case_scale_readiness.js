#!/usr/bin/env node
/* eslint-disable no-console */

const { evaluateScaleReadiness } = require("../src/case_graph/scale_readiness");

function parseArgs(argv) {
  const args = { targetCases: 20000, requireGreen: false };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--target-cases") args.targetCases = Number(argv[++i] || 20000);
    else if (arg === "--require-green") args.requireGreen = true;
  }
  return args;
}

const args = parseArgs(process.argv);
const report = evaluateScaleReadiness({ targetCases: args.targetCases });
console.log(JSON.stringify(report, null, 2));

if (args.requireGreen && report.status !== "green_for_requested_target") {
  process.exit(1);
}

