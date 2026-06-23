#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  DEFAULT_LOOP_CONFIG,
  branchBacklog,
  buildLoopReport,
  correctionQueue,
  writeLoopState,
} = require("../src/case_graph/case_fruit_growth_loop");

const ROOT = path.resolve(__dirname, "..");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

const errors = [];
const config = readJson(DEFAULT_LOOP_CONFIG);

assert(config.loop_id === "hk_criminal_case_fruit_growth_loop_v1", "unexpected loop id", errors);
assert(config.default_scope?.branch_id === "bail", "default loop must remain bail-scoped", errors);
assert(config.default_scope?.target_cases <= 50, "default target cases must stay <= 50", errors);
assert((config.default_scope?.blocked_scope || []).includes("cross_domain_criminal_20k"), "20k cross-domain must be blocked in default loop", errors);
assert((config.default_scope?.blocked_scope || []).includes("auto_answer_safe_promotion"), "auto answer-safe promotion must be blocked", errors);
assert(config.token_policy?.max_prompt_paragraphs_per_call === 1, "DeepSeek prompt must use one paragraph per call", errors);
assert(config.token_policy?.max_source_paragraph_chars <= 7000, "DeepSeek paragraph char budget too high", errors);
assert(config.browser_guided_discovery?.enabled === true, "browser-guided discovery policy should be enabled", errors);
assert(config.browser_guided_discovery?.policy_file?.includes("browser_discovery_policy.json"), "browser discovery policy file missing", errors);
assert(config.browser_guided_discovery?.default_seed_statuses?.deepseek === "llm_unverified_seed", "DeepSeek case seeds must stay unverified", errors);
assert((config.browser_guided_discovery?.required_before_proposition_pipeline || []).includes("verified_public_case"), "verified_public_case gate missing", errors);
assert((config.browser_guided_discovery?.forbidden_shortcuts || []).includes("llm_case_name_to_verified_case_without_public_source"), "LLM-to-verified shortcut must be forbidden", errors);
assert((config.correction_loop?.item_types || []).includes("quote_not_found"), "correction loop missing quote_not_found", errors);
assert((config.correction_loop?.item_types || []).includes("wrong_branch_candidate"), "correction loop missing wrong_branch_candidate", errors);
assert(config.correction_loop?.retry_policy?.never_auto_promote_after_retry === true, "correction retries must not auto-promote", errors);
assert((config.loop_stages || []).some(stage => (stage.checks || []).includes("duplicate_legalref_dis_check")), "loop missing duplicate LegalRef DIS check", errors);
assert((config.loop_stages || []).some(stage => (stage.checks || []).includes("duplicate_neutral_citation_check")), "loop missing duplicate neutral citation check", errors);
assert((config.safe_commands?.report_only || []).includes("node scripts/validate_bail_source_dedupe.js"), "report_only must run bail source dedupe validation", errors);
assert((config.safe_commands?.execute_safe_local || []).includes("node scripts/validate_bail_source_dedupe.js"), "execute_safe_local must run bail source dedupe validation", errors);

const source = fs.readFileSync(path.join(ROOT, "src", "case_graph", "case_fruit_growth_loop.js"), "utf8");
for (const token of [
  "validateBranchTargets",
  "validateBatchAgainstLoop",
  "wrong_branch_candidate",
  "quote_not_found",
  "candidate_only_gate_failed",
  "auto_promote_answer_safe: false",
  "bulk_auto_attach: false",
  "browser_guided_discovery",
]) {
  assert(source.includes(token), `case_fruit_growth_loop.js missing ${token}`, errors);
}

const report = buildLoopReport({ targetCases: 50 });
assert(report.branch_report.ok, "branch report should pass for configured bail nodes", errors);
assert(report.batch_report.ok, "batch report should pass for current bail artifacts", errors);
assert(report.branch_backlog_summary.nodes_with_candidate_fruits === 4, "all four bail nodes should have candidate fruits", errors);
assert(report.branch_backlog_summary.prompt_cache_entries >= 1, "prompt cache entries should be present", errors);
assert(report.execution_policy.auto_promote_answer_safe === false, "loop must not auto-promote answer_safe", errors);
assert(report.execution_policy.bulk_auto_attach === false, "loop must not bulk auto-attach", errors);
assert(report.browser_guided_discovery?.enabled === true, "report should expose browser-guided discovery", errors);
assert(report.browser_guided_discovery?.browser_mode === "allowlisted_discovery_only", "report should expose allowlisted browser mode", errors);
assert(report.browser_guided_discovery?.deepseek_default_status === "llm_unverified_seed", "report should expose unverified DeepSeek seed status", errors);
assert(report.commands.execute_safe_remote.length === 0, "remote commands must require explicit include-remote flag", errors);
assert(report.token_policy?.max_prompt_paragraphs_per_call === 1, "report missing token policy", errors);

const backlog = branchBacklog(config);
assert(backlog.token_cache.paragraph_prompt_cache.every(item => item.cache_key && item.deepseek_call_needed === false), "prompt cache should avoid unnecessary DeepSeek calls for current batch", errors);
const corrections = correctionQueue(config, report.batch_report);
assert(corrections.status === "empty", "current correction queue should be empty", errors);
assert(corrections.retry_policy.never_auto_promote_after_retry === true, "correction queue must block auto-promotion after retry", errors);
const tempState = fs.mkdtempSync(path.join(os.tmpdir(), "case-fruit-loop-"));
const stateWrite = writeLoopState({ report, config, stateDir: tempState });
for (const key of ["report", "branch_backlog", "correction_queue"]) {
  assert(fs.existsSync(stateWrite.files[key]), `state file not written: ${key}`, errors);
}
const writtenQueue = readJson(stateWrite.files.correction_queue);
assert(writtenQueue.queue_id === "case_fruit_growth_correction_queue_v1", "written correction queue id mismatch", errors);

const blockedLarge = buildLoopReport({ targetCases: 20000 });
assert(blockedLarge.scale_readiness.status === "blocked_for_large_scale", "20k loop must remain blocked", errors);
assert(blockedLarge.commands.execute_safe_local.length === 0, "20k blocked report must not expose execute_safe_local commands", errors);

if (errors.length) {
  console.error("Case fruit growth loop validation failed:");
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log("Case fruit growth loop validation passed.");
