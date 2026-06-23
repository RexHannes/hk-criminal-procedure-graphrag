#!/usr/bin/env node
/* eslint-disable no-console */

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const QUERY = "NSL Article 42 bail stringent threshold bail conditions Lai Chee Ying";
const PREDICTIVE_QUERY = "predictive evaluative exercise sufficient grounds continue acts endangering national security bail";
const UNDERTAKING_QUERY = "undertaking bail conditions national security Ma Chun Man";
const INDIVIDUAL_CIRCUMSTANCES_QUERY = "individual circumstances public record bail conditions Chan Chi Chuen";
const DELAY_QUERY = "delay case management committal trial bail Fan Kwok Wai";
const BATCH_DIR = path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "bail_public_batch_v1");
const propositionPayload = JSON.parse(fs.readFileSync(path.join(BATCH_DIR, "proposition_cards.json"), "utf8"));
const expectedBatchCount = propositionPayload.proposition_count || (propositionPayload.proposition_cards || []).length;

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

function runQuery(query) {
  const result = spawnSync(process.execPath, [
  path.join(ROOT, "scripts", "query_legal_qdrant.js"),
  "--query",
  query,
  "--collection",
  "hk_proposition_cards",
  "--top-k",
  "50",
  ], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
    process.exit(result.status || 1);
  }
  return JSON.parse(result.stdout);
}

const payload = runQuery(QUERY);
const predictivePayload = runQuery(PREDICTIVE_QUERY);
const undertakingPayload = runQuery(UNDERTAKING_QUERY);
const individualCircumstancesPayload = runQuery(INDIVIDUAL_CIRCUMSTANCES_QUERY);
const delayPayload = runQuery(DELAY_QUERY);
const errors = [];
const hits = payload.hits || [];
const predictiveHits = predictivePayload.hits || [];
const undertakingHits = undertakingPayload.hits || [];
const individualCircumstancesHits = individualCircumstancesPayload.hits || [];
const delayHits = delayPayload.hits || [];
const bailHits = hits.filter(hit => hit.batch_id === "criminal_bail_public_batch_v1");
const predictiveBailHits = predictiveHits.filter(hit => hit.batch_id === "criminal_bail_public_batch_v1");
const undertakingBailHits = undertakingHits.filter(hit => hit.batch_id === "criminal_bail_public_batch_v1");
const individualCircumstancesBailHits = individualCircumstancesHits.filter(hit => hit.batch_id === "criminal_bail_public_batch_v1");
const delayBailHits = delayHits.filter(hit => hit.batch_id === "criminal_bail_public_batch_v1");
const topIds = hits.slice(0, 8).map(hit => hit.proposition_id);
const allIds = bailHits.map(hit => hit.proposition_id);
const predictiveIds = predictiveBailHits.map(hit => hit.proposition_id);
const undertakingIds = undertakingBailHits.map(hit => hit.proposition_id);
const individualCircumstancesIds = individualCircumstancesBailHits.map(hit => hit.proposition_id);
const delayIds = delayBailHits.map(hit => hit.proposition_id);
const blob = JSON.stringify(bailHits).toLowerCase();

assert(bailHits.length >= Math.min(30, expectedBatchCount), `expected substantial bail batch proposition recall, got ${bailHits.length} of ${expectedBatchCount}`, errors);
assert(topIds.includes("prop_lai_2021_nsl_more_stringent_threshold_p53"), "expected Lai stringent-threshold proposition in top 8", errors);
assert(topIds.includes("prop_lai_2021_nsl_summary_p70") || topIds.includes("prop_lai_2021_nsl_art42_text_p52"), "expected Lai Article 42 proposition in top 8", errors);
assert(allIds.includes("prop_lai_2021_bail_conditions_relevant_p57"), "expected Lai bail-conditions relevance proposition", errors);
assert(allIds.includes("prop_lai_2021_tong_limited_p72"), "expected Tong-limited lineage proposition in retrieved set", errors);
assert(allIds.includes("prop_lai_cfi_2020_tailored_undertaking_sufficient_p33"), "expected Lai CFI tailored undertaking proposition in retrieved set", errors);
assert(allIds.includes("prop_lai_448_2021_everything_relevant_p7"), "expected post-CFA Lai everything-relevant proposition in retrieved set", errors);
assert(undertakingIds.includes("prop_ma_2020_undertaking_not_accepted_p33"), "expected Ma undertaking contrast proposition in targeted undertaking query", errors);
assert(individualCircumstancesIds.includes("prop_chan_2021_individual_circumstances_p23"), "expected Chan individual-circumstances proposition in targeted individual-circumstances query", errors);
assert(delayIds.includes("prop_fan_2022_case_management_delay_p10"), "expected Fan delay/case-management proposition in targeted delay query", errors);
assert(predictiveBailHits.length >= 20, `expected predictive/evaluative query to recall bail candidates, got ${predictiveBailHits.length}`, errors);
assert(predictiveIds.includes("prop_chui_2021_predictive_assessment_refusal_p11"), "expected Chui predictive-assessment proposition in targeted query", errors);
assert(predictiveIds.includes("prop_wan_2021_predictive_exercise_p13"), "expected Wan predictive-exercise proposition in targeted query", errors);
assert(predictiveIds.includes("prop_mo_2021_predictive_refusal_p21"), "expected Mo predictive-refusal proposition in targeted query", errors);
assert(predictiveIds.includes("prop_chow_2021_conditions_nsl_satisfied_p25"), "expected Chow conditions-satisfied proposition in targeted query", errors);
assert(bailHits.every(hit => hit.citation && hit.pinpoint), "every bail hit should include citation and pinpoint", errors);
assert(bailHits.every(hit => hit.answer_layer_status === "candidate_only"), "bail public batch hits must remain candidate_only", errors);
assert(bailHits.every(hit => hit.review_status === "machine_candidate"), "bail public batch hits must remain machine_candidate", errors);
assert(predictiveBailHits.every(hit => hit.answer_layer_status === "candidate_only"), "targeted bail hits must remain candidate_only", errors);
assert(predictiveBailHits.every(hit => hit.review_status === "machine_candidate"), "targeted bail hits must remain machine_candidate", errors);
assert(undertakingBailHits.every(hit => hit.answer_layer_status === "candidate_only"), "undertaking bail hits must remain candidate_only", errors);
assert(individualCircumstancesBailHits.every(hit => hit.answer_layer_status === "candidate_only"), "individual-circumstances bail hits must remain candidate_only", errors);
assert(delayBailHits.every(hit => hit.answer_layer_status === "candidate_only"), "delay bail hits must remain candidate_only", errors);
assert(blob.includes("criminal_procedure_hk.nsl_bail"), "expected NSL bail doctrine tag", errors);
assert(!blob.includes("personal_injury") && !blob.includes("restaurant") && !blob.includes("workplace"), "irrelevant PI/workplace terms leaked into bail retrieval", errors);

if (errors.length) {
  console.error("Public bail Qdrant retrieval validation failed:");
  errors.forEach(error => console.error(`- ${error}`));
  console.error(JSON.stringify({
    primary_ids: allIds,
    predictive_ids: predictiveIds,
    undertaking_ids: undertakingIds,
    individual_circumstances_ids: individualCircumstancesIds,
    delay_ids: delayIds,
  }, null, 2));
  process.exit(1);
}

console.log("Public bail Qdrant retrieval validation passed.");
