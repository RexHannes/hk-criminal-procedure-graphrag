#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_QUEUE = path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "multibranch_discovery_queue_2500.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function parseArgs(argv) {
  const args = { queue: DEFAULT_QUEUE };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--queue") args.queue = path.resolve(ROOT, argv[++i] || args.queue);
  }
  return args;
}

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

const args = parseArgs(process.argv);
const queue = readJson(args.queue);
const errors = [];

assert(queue.status === "candidate_discovery_only_not_ingested", "queue must be discovery-only", errors);
assert(queue.policy?.public_judgment_required_before_ingestion === true, "public judgment verification required", errors);
assert(queue.policy?.secondary_public_leads_are_not_authority === true, "secondary leads must not be authority", errors);
assert(queue.policy?.deepseek_outputs_are_not_authority === true, "DeepSeek outputs must not be authority", errors);
assert(queue.policy?.exact_quote_required === true, "exact quote required", errors);
assert(queue.policy?.private_or_licensed_sources_allowed === false, "private/licensed sources must be blocked", errors);
assert(queue.policy?.answer_safe_by_default === false, "answer_safe by default must be false", errors);

for (const branch of queue.branch_discovery || []) {
  assert(branch.search_queries?.length > 0, `${branch.branch_family}: search queries required`, errors);
  for (const lead of branch.candidate_case_leads || []) {
    assert(lead.status === "search_result_candidate_needs_public_judgment_verification", `${lead.seed_id}: bad lead status`, errors);
    assert(lead.answer_safe_allowed === false, `${lead.seed_id}: answer_safe must be blocked`, errors);
    assert((lead.required_before_ingestion || []).includes("exact_quote_validate_every_proposition"), `${lead.seed_id}: missing quote gate`, errors);
  }
}

const report = {
  validator: "multibranch_discovery_queue_v1",
  queue_id: queue.queue_id,
  branch_count: (queue.branch_discovery || []).length,
  candidate_case_leads: (queue.branch_discovery || []).reduce((sum, branch) => sum + (branch.candidate_case_leads || []).length, 0),
  search_query_count: (queue.branch_discovery || []).reduce((sum, branch) => sum + (branch.search_queries || []).length, 0),
  status: errors.length ? "failed" : "passed",
  errors,
};
console.log(JSON.stringify(report, null, 2));
if (errors.length) process.exit(1);
