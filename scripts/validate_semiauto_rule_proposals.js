#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");
const { validateExtractionRuleProposals } = require("../src/case_graph/validate_extraction_rule_proposals");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_BATCH = path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "bail_public_batch_v1");

function parseArgs(argv) {
  const args = {
    proposals: path.join(DEFAULT_BATCH, "semiauto_rule_proposals.sample.json"),
    manifest: path.join(DEFAULT_BATCH, "source_manifest.json"),
    output: "",
    compileRules: false,
    requireAllAccepted: true,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--proposals") args.proposals = path.resolve(ROOT, argv[++i] || args.proposals);
    else if (arg === "--manifest") args.manifest = path.resolve(ROOT, argv[++i] || args.manifest);
    else if (arg === "--output") args.output = path.resolve(ROOT, argv[++i] || "");
    else if (arg === "--compile-rules") args.compileRules = true;
    else if (arg === "--allow-rejections") args.requireAllAccepted = false;
  }
  return args;
}

(async () => {
  const args = parseArgs(process.argv);
  const report = await validateExtractionRuleProposals({
    proposalPath: args.proposals,
    manifestPath: args.manifest,
    compileRules: args.compileRules,
  });
  if (args.output) {
    fs.mkdirSync(path.dirname(args.output), { recursive: true });
    fs.writeFileSync(args.output, `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(JSON.stringify(report, null, 2));
  if (args.requireAllAccepted && report.rejected_count > 0) process.exit(1);
})().catch(error => {
  console.error(error.message);
  if (error.payload) console.error(JSON.stringify(error.payload, null, 2));
  process.exit(1);
});

