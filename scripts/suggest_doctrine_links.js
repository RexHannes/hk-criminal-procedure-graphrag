#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");
const { linkProposalToDoctrineNodes } = require("../src/case_graph/hybrid_doctrine_linker");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_PROPOSALS = path.join(
  ROOT,
  "data",
  "legal_ingest",
  "criminal_evidence_tree_v1",
  "bail_public_batch_v1",
  "semiauto_rule_proposals.sample.json",
);

function parseArgs(argv) {
  const args = { proposals: DEFAULT_PROPOSALS, limit: 5, output: "" };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--proposals") args.proposals = path.resolve(ROOT, argv[++i] || args.proposals);
    else if (arg === "--limit") args.limit = Number(argv[++i] || 5);
    else if (arg === "--output") args.output = path.resolve(ROOT, argv[++i] || "");
  }
  return args;
}

const args = parseArgs(process.argv);
const payload = JSON.parse(fs.readFileSync(args.proposals, "utf8"));
const suggestions = (payload.proposals || []).map(proposal => linkProposalToDoctrineNodes(proposal, {
  limit: args.limit,
  allowedNodeIds: proposal.candidate_doctrine_node_ids || [],
}));
const report = {
  linker: "local_lexical_doctrine_linker_v1",
  generated_at: new Date().toISOString(),
  proposal_set_id: payload.proposal_set_id,
  proposal_count: suggestions.length,
  suggestions,
  policy: {
    output_status: "machine_candidate_only",
    no_auto_answer_safe: true,
  },
};
if (args.output) {
  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify(report, null, 2));
