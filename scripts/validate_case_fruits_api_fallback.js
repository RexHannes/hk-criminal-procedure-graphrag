#!/usr/bin/env node
/* eslint-disable no-console */

const { localCaseFruitEvidenceForNode } = require("../src/case_graph/local_case_fruit_evidence");

const errors = [];
function assert(condition, message) {
  if (!condition) errors.push(message);
}

const factors = localCaseFruitEvidenceForNode("criminal_procedure_hk.bail_factors");
const conditions = localCaseFruitEvidenceForNode("criminal_procedure_hk.bail_flow_step5");
const nslBail = localCaseFruitEvidenceForNode("criminal_procedure_hk.nsl_bail");
const unrelated = localCaseFruitEvidenceForNode("criminal_procedure_hk.bail_pending_appeal");

assert(factors.length >= 3, "bail_factors should expose fixture plus public candidate case fruits");
assert(conditions.length >= 3, "bail_flow_step5 should expose fixture plus public candidate case fruits");
assert(nslBail.length >= 7, "nsl_bail should expose public candidate case fruits");
assert(unrelated.length === 0, "unmapped bail node should not receive pilot evidence");
for (const item of [...factors, ...conditions, ...nslBail]) {
  assert(item.answer_layer_status === "candidate_only", `${item.proposition_id}: must remain candidate_only`);
  assert(item.human_review_status === "unreviewed", `${item.proposition_id}: must remain unreviewed`);
  assert((item.validator_flags || []).includes("needs_human_review"), `${item.proposition_id}: must carry needs_human_review flag`);
  assert(
    (item.validator_flags || []).includes("not_real_authority") || (item.validator_flags || []).includes("public_source_candidate"),
    `${item.proposition_id}: must identify fixture or public-source candidate status`
  );
  assert(item.supporting_quote && item.paragraph_text.includes(item.supporting_quote), `${item.proposition_id}: quote must appear in paragraph text`);
}

if (errors.length) {
  console.error("Case fruits API fallback validation failed:");
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log("Case fruits API fallback validation passed.");
