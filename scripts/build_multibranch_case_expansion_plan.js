#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const QUEUE_PATH = path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "landmark_first_expansion_queue.json");
const DEFAULT_OUTPUT = path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "multibranch_expansion_plan_2500.json");

const BRANCH_WEIGHTS = {
  investigation_arrest_search_detention: 1.35,
  theft_dishonesty_fraud: 1.25,
  public_order_riot_unlawful_assembly: 1.2,
  trial_no_case_jury_directions: 1.15,
  appeals_reviews_sentence: 1.0,
  offences_against_person: 1.0,
  bribery_corruption_misconduct: 0.9,
  aml_money_laundering: 0.85,
  indictments_charges_joinder: 0.7,
  defences: 0.65,
  nsl_procedure_non_bail: 0.65,
  other_criminal_procedure: 0.35,
  other_criminal_law: 0.35,
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function parseArgs(argv) {
  const args = {
    targetCases: 2500,
    casesPerShard: 50,
    output: DEFAULT_OUTPUT,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--target-cases") args.targetCases = Number(argv[++i] || args.targetCases);
    else if (arg === "--cases-per-shard") args.casesPerShard = Number(argv[++i] || args.casesPerShard);
    else if (arg === "--output") args.output = path.resolve(ROOT, argv[++i] || args.output);
  }
  return args;
}

function branchScore(branch) {
  const priorityBoost = Math.max(1, 5 - Number(branch.priority || 4));
  const branchWeight = BRANCH_WEIGHTS[branch.branch_family] || 0.5;
  const queued = Math.max(1, Number(branch.queued_node_count || 0));
  return queued * priorityBoost * branchWeight;
}

function quotaFloorForPriority(priority, targetCases) {
  const scale = Math.max(1, targetCases / 2500);
  const base = Number(priority || 4) <= 2 ? 50 : 25;
  return Math.max(base, Math.floor(base * Math.sqrt(scale)));
}

function quotaCapForPriority(priority, targetCases) {
  const scale = Math.max(1, targetCases / 2500);
  if (Number(priority || 4) <= 1) return Math.floor(450 * scale);
  if (Number(priority || 4) <= 2) return Math.floor(350 * scale);
  if (Number(priority || 4) <= 3) return Math.floor(250 * scale);
  return Math.floor(200 * scale);
}

function allocateQuotas(branches, targetCases) {
  const scored = branches.map(branch => ({ branch, score: branchScore(branch) }));
  const totalScore = scored.reduce((sum, item) => sum + item.score, 0) || 1;
  const allocations = scored.map(({ branch, score }) => {
    const raw = Math.floor((score / totalScore) * targetCases);
    const minCases = quotaFloorForPriority(branch.priority, targetCases);
    const maxCases = quotaCapForPriority(branch.priority, targetCases);
    return {
      ...branch,
      target_case_quota: Math.min(maxCases, Math.max(minCases, raw)),
      allocation_score: Number(score.toFixed(4)),
      initial_rung_case_count: Number(branch.priority || 4) <= 2 ? 20 : 10,
      review_gate_every_cases: 50,
      max_cases_before_gold_review: Number(branch.priority || 4) <= 2 ? 100 : 50,
    };
  });
  let total = allocations.reduce((sum, item) => sum + item.target_case_quota, 0);
  const sorted = [...allocations].sort((a, b) => a.priority - b.priority || b.allocation_score - a.allocation_score);
  let idx = 0;
  while (total < targetCases && sorted.length) {
    const item = sorted[idx % sorted.length];
    const cap = quotaCapForPriority(item.priority, targetCases);
    if (item.target_case_quota < cap) {
      item.target_case_quota += 1;
      total += 1;
    }
    idx += 1;
    if (idx > targetCases * 3) break;
  }
  idx = sorted.length - 1;
  while (total > targetCases && sorted.length) {
    const item = sorted[idx % sorted.length];
    const floor = quotaFloorForPriority(item.priority, targetCases);
    if (item.target_case_quota > floor) {
      item.target_case_quota -= 1;
      total -= 1;
    }
    idx -= 1;
    if (idx < 0) idx = sorted.length - 1;
    if (Math.abs(idx) > targetCases * 3) break;
  }
  return allocations.sort((a, b) => a.priority - b.priority || b.target_case_quota - a.target_case_quota);
}

function makeShards(branches, casesPerShard) {
  const shards = [];
  let index = 1;
  for (const branch of branches) {
    let start = 1;
    while (start <= branch.target_case_quota) {
      const end = Math.min(branch.target_case_quota, start + casesPerShard - 1);
      shards.push({
        shard_id: `mb_${String(index).padStart(4, "0")}`,
        branch_family: branch.branch_family,
        scope: `${branch.branch_family}_public_cases`,
        case_ordinal_start: start,
        case_ordinal_end: end,
        max_cases: end - start + 1,
        status: "planned_not_started",
        execution_mode: "candidate_only_public_source",
      });
      start = end + 1;
      index += 1;
    }
  }
  return shards;
}

function main() {
  const args = parseArgs(process.argv);
  const queue = readJson(QUEUE_PATH);
  const branches = allocateQuotas(queue.branch_family_queue || [], args.targetCases);
  const shards = makeShards(branches, args.casesPerShard);
  const plan = {
    plan_id: `hk_criminal_multibranch_public_case_expansion_${args.targetCases}_v1`,
    generated_at: new Date().toISOString(),
    source_queue_id: queue.queue_id,
    target_cases: args.targetCases,
    estimated_case_range: [Math.floor(args.targetCases * 0.8), Math.ceil(args.targetCases * 1.2)],
    status: "planned_candidate_only_not_bulk_executed",
    purpose: "Sorted multi-branch public case-fruit expansion plan for HK criminal law/procedure GraphRAG.",
    source_policy: {
      public_sources_only: true,
      allowed_public_sources: ["LegalRef", "HKLII", "Judiciary"],
      private_or_licensed_sources_allowed: false,
      private_book_text_allowed_in_public_artifacts: false,
      notebooklm_role: "candidate_tree_and_landmark_lineage_proposer_only",
      deepseek_role: "candidate_case_seed_or_extraction_rule_proposer_only",
    },
    extraction_policy: {
      exact_quote_required: true,
      paragraph_text_required: true,
      doctrine_node_id_must_exist: true,
      citation_and_pinpoint_required: true,
      candidate_only_by_default: true,
      answer_safe_by_default: false,
      human_review_required_for_answer_safe: true,
    },
    runtime_policy: {
      max_parallel_shards_without_orchestrator: 1,
      cases_per_shard: args.casesPerShard,
      requires_idempotent_upserts: true,
      requires_checksum_dedup: true,
      requires_resume_manifest: true,
      qdrant_upsert_allowed_for_validated_candidate_cards: true,
      supabase_seed_requires_credentials: true,
    },
    coverage_snapshot: queue.coverage_summary,
    branch_allocations: branches.map(branch => ({
      branch_family: branch.branch_family,
      priority: branch.priority,
      queued_node_count: branch.queued_node_count,
      current_candidate_fruit_status: branch.queued_node_count > 0 ? "needs_more_branch_fruits" : "mostly_covered_or_anchor",
      target_case_quota: branch.target_case_quota,
      initial_rung_case_count: branch.initial_rung_case_count,
      review_gate_every_cases: branch.review_gate_every_cases,
      max_cases_before_gold_review: branch.max_cases_before_gold_review,
      sample_node_ids: branch.sample_node_ids || [],
      notebooklm_prompt_hint: branch.notebooklm_prompt_hint,
      allowed_status: "machine_candidate",
      answer_safe_allowed: false,
    })),
    shards,
    next_actions: [
      "For each priority-1 branch, collect 3-5 public landmark cases first.",
      "Verify each candidate case against LegalRef/HKLII/Judiciary before extracting propositions.",
      "Use DeepSeek only on one public paragraph at a time to propose candidate extraction rules.",
      "Reject any proposal whose exact_quote is not a substring of the paragraph card.",
      "Upsert only paragraph/proposition cards that passed source, quote, doctrine-node, and tenant checks.",
      "Run retrieval benchmark after each 50-case branch rung; do not call the branch answer-safe until review/golden queries pass.",
    ],
  };
  writeJson(args.output, plan);
  console.log(JSON.stringify({
    output: path.relative(ROOT, args.output),
    status: plan.status,
    target_cases: plan.target_cases,
    estimated_case_range: plan.estimated_case_range,
    branch_count: plan.branch_allocations.length,
    shard_count: plan.shards.length,
    top_allocations: plan.branch_allocations.slice(0, 8).map(item => ({
      branch_family: item.branch_family,
      priority: item.priority,
      target_case_quota: item.target_case_quota,
      initial_rung_case_count: item.initial_rung_case_count,
    })),
  }, null, 2));
}

main();
