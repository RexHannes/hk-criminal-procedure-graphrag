#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");
const {
  DEFAULT_LOOP_CONFIG,
  buildLoopReport,
  executeLoop,
} = require("../src/case_graph/case_fruit_growth_loop");

const ROOT = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const args = {
    config: DEFAULT_LOOP_CONFIG,
    targetCases: 50,
    executeSafe: false,
    includeRemote: false,
    useDeepSeek: false,
    output: "",
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--config") args.config = path.resolve(ROOT, argv[++i] || args.config);
    else if (arg === "--target-cases") args.targetCases = Number(argv[++i] || args.targetCases);
    else if (arg === "--execute-safe") args.executeSafe = true;
    else if (arg === "--include-remote") args.includeRemote = true;
    else if (arg === "--use-deepseek") args.useDeepSeek = true;
    else if (arg === "--output") args.output = path.resolve(ROOT, argv[++i] || "");
  }
  return args;
}

const args = parseArgs(process.argv);
const report = buildLoopReport({
  configPath: args.config,
  targetCases: args.targetCases,
  mode: args.executeSafe ? "execute_safe" : "report",
  includeRemote: args.includeRemote,
  useDeepSeek: args.useDeepSeek,
});

if (args.executeSafe) {
  const config = JSON.parse(fs.readFileSync(args.config, "utf8"));
  report.command_results = executeLoop(report, config, { includeRemote: args.includeRemote });
  report.command_summary = {
    attempted: report.command_results.length,
    failed: report.command_results.filter(item => !item.ok).length,
  };
  if (report.command_summary.failed) report.status = "executed_with_failures";
}

if (args.output) {
  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${JSON.stringify(report, null, 2)}\n`);
}

console.log(JSON.stringify(report, null, 2));
if (report.status === "blocked_needs_correction_queue_review") process.exit(2);
if (report.command_summary?.failed) process.exit(1);
