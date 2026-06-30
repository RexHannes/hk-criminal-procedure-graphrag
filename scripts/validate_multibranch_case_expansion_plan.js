#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_PLAN = path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "multibranch_expansion_plan_2500.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function parseArgs(argv) {
  const args = { plan: DEFAULT_PLAN };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--plan") args.plan = path.resolve(ROOT, argv[++i] || args.plan);
  }
  return args;
}

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

const args = parseArgs(process.argv);
const plan = readJson(args.plan);
const errors = [];
const branchFamilies = new Set((plan.branch_allocations || []).map(item => item.branch_family));
const totalQuota = (plan.branch_allocations || []).reduce((sum, item) => sum + Number(item.target_case_quota || 0), 0);

assert(plan.status === "planned_candidate_only_not_bulk_executed", "plan must be candidate-only and not executed", errors);
assert(plan.source_policy?.public_sources_only === true, "public_sources_only required", errors);
assert(plan.source_policy?.private_or_licensed_sources_allowed === false, "private/licensed sources must be blocked", errors);
assert(plan.source_policy?.private_book_text_allowed_in_public_artifacts === false, "private book text must be blocked", errors);
assert(plan.extraction_policy?.exact_quote_required === true, "exact quote validation required", errors);
assert(plan.extraction_policy?.answer_safe_by_default === false, "answer_safe by default must be false", errors);
assert(plan.extraction_policy?.human_review_required_for_answer_safe === true, "answer_safe must require human review", errors);
assert(plan.runtime_policy?.requires_idempotent_upserts === true, "idempotent upserts required", errors);
assert(plan.runtime_policy?.requires_checksum_dedup === true, "checksum dedupe required", errors);
assert(totalQuota === Number(plan.target_cases || 0), `branch quotas ${totalQuota} must equal target_cases ${plan.target_cases}`, errors);

for (const required of [
  "investigation_arrest_search_detention",
  "theft_dishonesty_fraud",
  "public_order_riot_unlawful_assembly",
  "trial_no_case_jury_directions",
  "appeals_reviews_sentence",
]) {
  assert(branchFamilies.has(required), `missing required branch family ${required}`, errors);
}

for (const branch of plan.branch_allocations || []) {
  assert(branch.allowed_status === "machine_candidate", `${branch.branch_family}: allowed_status must be machine_candidate`, errors);
  assert(branch.answer_safe_allowed === false, `${branch.branch_family}: answer_safe must be blocked`, errors);
  assert(Number(branch.target_case_quota || 0) > 0, `${branch.branch_family}: quota must be positive`, errors);
  assert(Number(branch.review_gate_every_cases || 0) <= 50, `${branch.branch_family}: review gate must be every 50 cases or less`, errors);
}

for (const shard of plan.shards || []) {
  assert(branchFamilies.has(shard.branch_family), `${shard.shard_id}: unknown branch_family`, errors);
  assert(shard.execution_mode === "candidate_only_public_source", `${shard.shard_id}: bad execution_mode`, errors);
  assert(Number(shard.max_cases || 0) <= Number(plan.runtime_policy?.cases_per_shard || 50), `${shard.shard_id}: shard too large`, errors);
}

const report = {
  validator: "multibranch_case_expansion_plan_v1",
  plan_id: plan.plan_id,
  target_cases: plan.target_cases,
  total_quota: totalQuota,
  branch_count: (plan.branch_allocations || []).length,
  shard_count: (plan.shards || []).length,
  status: errors.length ? "failed" : "passed",
  errors,
};
console.log(JSON.stringify(report, null, 2));
if (errors.length) process.exit(1);
