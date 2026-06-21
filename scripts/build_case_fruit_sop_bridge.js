#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");
const {
  buildCaseFruitSopBridge,
  writeCaseFruitSopBridgeCache,
} = require("../src/case_graph/case_fruit_sop_bridge");

const ROOT = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const args = {
    nodeId: "criminal_procedure_hk.bail_factors",
    query: "",
    output: "",
    writeCache: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--node-id") args.nodeId = argv[++i] || args.nodeId;
    else if (arg === "--query") args.query = argv[++i] || "";
    else if (arg === "--output") args.output = path.resolve(ROOT, argv[++i] || "");
    else if (arg === "--write-cache") args.writeCache = true;
  }
  return args;
}

(async () => {
  const args = parseArgs(process.argv);
  const bridge = args.writeCache
    ? await writeCaseFruitSopBridgeCache({ doctrineNodeId: args.nodeId, query: args.query })
    : buildCaseFruitSopBridge({ doctrineNodeId: args.nodeId, query: args.query });
  if (args.output) {
    fs.mkdirSync(path.dirname(args.output), { recursive: true });
    fs.writeFileSync(args.output, `${JSON.stringify(bridge, null, 2)}\n`);
  }
  console.log(JSON.stringify(bridge, null, 2));
})().catch(error => {
  console.error(error.message);
  if (error.payload) console.error(JSON.stringify(error.payload, null, 2));
  process.exit(1);
});
