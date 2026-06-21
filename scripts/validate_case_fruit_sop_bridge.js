#!/usr/bin/env node
/* eslint-disable no-console */

const {
  buildCaseFruitSopBridge,
} = require("../src/case_graph/case_fruit_sop_bridge");

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

const errors = [];
const bridge = buildCaseFruitSopBridge({
  doctrineNodeId: "criminal_procedure_hk.bail_factors",
  query: "Build a bail factors SOP from recalled case fruits",
});

assert(bridge.evidence_count > 0, "bail_factors should recall case fruit evidence", errors);
assert(bridge.legal_ingest_bundle.proposition_cards[0].proposition_id.includes("lai_2021") || bridge.cache_records.sop_playbook.steps[0]?.text?.includes("[2021] HKCFA 3"), "SOP bridge should lineage-rank current CFA material first where available", errors);
assert(bridge.policy.no_llm_tokens_used === true, "SOP bridge should use no LLM tokens", errors);
assert(bridge.policy.auto_promote_answer_safe === false, "SOP bridge must not auto-promote answer_safe", errors);
assert(bridge.source_fingerprint, "source fingerprint missing", errors);
assert(bridge.cache_records.retrieval_bundle.bundle_id.startsWith("retrieval_bundle_"), "retrieval bundle record missing", errors);
assert(bridge.cache_records.answer_snapshot.answer_status === "research_only", "answer snapshot should remain research_only", errors);
assert(bridge.cache_records.sop_playbook.status === "draft", "SOP playbook should remain draft until review", errors);
assert(bridge.response_payload.warnings.includes("case_fruits_research_only_until_reviewed"), "research-only warning missing", errors);
assert(bridge.applied.applied_answer.sections.some(section => section.heading === "SOP Use"), "SOP Use section missing", errors);
assert(bridge.legal_ingest_bundle.proposition_cards.every(card => card.human_review_required === true), "candidate cards should require human review", errors);

const emptyBridge = buildCaseFruitSopBridge({
  doctrineNodeId: "criminal_procedure_hk.no_such_node_for_sop_bridge_test",
});
assert(emptyBridge.evidence_count === 0, "unknown node should have no evidence", errors);
assert(emptyBridge.response_payload.unsupported_claims.length === 1, "unknown node should create unsupported no-evidence claim", errors);
assert(emptyBridge.cache_records.sop_playbook.status === "draft", "empty SOP should still be draft, not answer-safe", errors);

if (errors.length) {
  console.error("Case fruit SOP bridge validation failed:");
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log("Case fruit SOP bridge validation passed.");
