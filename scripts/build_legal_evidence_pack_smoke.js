#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");
const { buildEvidencePack } = require("../src/legal_answer/build_evidence_pack");

function parseArgs(argv) {
  const args = {
    query: "What is the consequence of inconsistent factual pleadings across more than one case? abuse of process estoppel",
    out: "",
    topK: 5,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--query") args.query = argv[++i] || args.query;
    else if (arg === "--out") args.out = argv[++i] || "";
    else if (arg === "--top-k") args.topK = Number(argv[++i] || 5);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const pack = await buildEvidencePack({ query: args.query, topK: args.topK });
  if (args.out) {
    const outPath = path.resolve(args.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(pack, null, 2));
  }
  console.log(JSON.stringify({
    status: pack.evidence_chunks.length ? "passed" : "no_hits",
    evidence_pack_id: pack.evidence_pack_id,
    query: pack.query,
    returned_count: pack.retrieval_trace.returned_count,
    proposition_families: pack.proposition_families,
    warnings: pack.warnings,
  }, null, 2));
}

main().catch(error => {
  console.error(error.message);
  if (error.payload) console.error(JSON.stringify(error.payload, null, 2));
  process.exit(1);
});
