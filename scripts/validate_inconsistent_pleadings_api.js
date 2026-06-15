#!/usr/bin/env node
/* Validate source-card backed inconsistent-pleadings vertical via the API. */

const handler = require("../api/search-evidence.js");

function run(query) {
  return new Promise((resolve, reject) => {
    const req = { method: "GET", query: { q: query } };
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        if (this.statusCode >= 400) reject(new Error(`HTTP ${this.statusCode}`));
        else resolve(payload);
      },
    };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

function blob(value) {
  return JSON.stringify(value || {}).toLowerCase();
}

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

(async () => {
  const query = "What is the consequence for adducing inconsistent factual pleadings for the same Plaintiff across more than one case? Please elaborate on abuse of process, estoppel and collateral attack.";
  const payload = await run(query);
  const errors = [];
  const text = blob(payload.applied_answer);
  const rules = payload.source_backed_rules || [];
  const forms = payload.form_candidates || [];
  const audit = payload.source_audit || {};

  assert(payload.legal_ingest_vertical?.vertical_id === "inconsistent_pleadings_across_proceedings", "missing legal ingest vertical summary", errors);
  assert(payload.classification?.scenario === "inconsistent_positions_across_proceedings", "wrong scenario", errors);
  assert(payload.answer_contract?.source_card_policy, "missing source-card answer policy", errors);
  assert(rules.length >= 5, "expected at least five source-backed rule records", errors);
  rules.forEach(rule => {
    assert(rule.proposition_card_id, "source-backed rule missing proposition_card_id", errors);
    assert(rule.paragraph_card_id, "source-backed rule missing paragraph_card_id", errors);
    assert(rule.answer_layer_status === "research_only", "source-backed rules should remain research_only", errors);
  });
  assert(
    rules.some(rule => rule.proposition_card_id === "prop_abuse_estoppel_lancom_p43" && String(rule.citation || "").includes("[2022] HKCFI 381")),
    "estoppel/abuse rule should map to Lancom proposition card",
    errors
  );
  [
    "abuse of process",
    "estoppel",
    "collateral attack",
    "strike-out",
    "stay",
    "credibility",
    "costs",
  ].forEach(term => assert(text.includes(term), `missing ${term}`, errors));
  [
    "form_pleading_inconsistency_matrix",
    "form_strikeout_stay_summons_candidate",
    "form_affirmation_exhibiting_inconsistent_pleadings",
    "form_skeleton_argument_abuse_estoppel_collateral_attack",
    "form_costs_submission_inconsistent_positions",
    "form_cross_examination_note_inconsistent_statements",
  ].forEach(formId => assert(forms.some(form => form.form_id === formId), `missing form candidate ${formId}`, errors));
  assert(audit.display === "collapsed", "source audit should be collapsed", errors);
  assert((audit.proposition_cards || []).length >= 5, "source audit missing proposition cards", errors);
  assert(!text.includes("restaurant") && !text.includes("workplace") && !text.includes("road traffic"), "irrelevant PI leakage in applied answer", errors);
  assert((payload.unsupported_claims || []).some(claim => blob(claim).includes("collateral attack")), "collateral attack should be explicitly source-verification-required", errors);

  if (errors.length) {
    console.error("Inconsistent pleadings API validation failed:");
    errors.forEach(error => console.error(`- ${error}`));
    process.exit(1);
  }
  console.log("Inconsistent pleadings API validation passed.");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
