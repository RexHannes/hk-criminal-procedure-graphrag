#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");
const { loadEnv } = require("../src/case_graph/scale_readiness");
const { executeCaseScaleShard, DEFAULT_REGISTRY } = require("../src/orchestration/case_scale_ingest_worker");

const ROOT = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const args = {
    plan: "",
    shardId: "",
    registry: DEFAULT_REGISTRY,
    output: "",
    dryRun: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--plan") args.plan = path.resolve(ROOT, argv[++i] || "");
    else if (arg === "--shard-id") args.shardId = argv[++i] || "";
    else if (arg === "--registry") args.registry = path.resolve(ROOT, argv[++i] || args.registry);
    else if (arg === "--output") args.output = path.resolve(ROOT, argv[++i] || "");
    else if (arg === "--dry-run") args.dryRun = true;
  }
  return args;
}

const args = parseArgs(process.argv);
if (!args.plan) throw new Error("plan required");
if (!args.shardId) throw new Error("shard-id required");

const plan = JSON.parse(fs.readFileSync(args.plan, "utf8"));
const shard = (plan.shards || []).find(item => item.shard_id === args.shardId);
if (!shard) throw new Error(`unknown_shard_id:${args.shardId}`);

const env = loadEnv({ root: ROOT });
const report = executeCaseScaleShard({
  plan,
  shard,
  registryPath: args.registry,
  env,
  dryRun: args.dryRun,
});

if (args.output) {
  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${JSON.stringify(report, null, 2)}\n`);
}

console.log(JSON.stringify(report, null, 2));
if (report.status === "indexed_with_failures") process.exit(1);