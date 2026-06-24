#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const ARTIFACT_PATH = path.join(ROOT, "data", "legal_ingest", "routing", "notebooklm_domain_arbiter_candidate_v1.json");

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

const errors = [];
const artifact = JSON.parse(fs.readFileSync(ARTIFACT_PATH, "utf8"));

assert(artifact.status === "candidate_only_requires_public_source_verification", "artifact must remain candidate-only", errors);
assert(String(artifact.warning || "").includes("not public authority"), "warning must state not public authority", errors);
assert((artifact.top_level_domains || []).includes("criminal_law_and_procedure"), "missing criminal domain", errors);
assert((artifact.top_level_domains || []).includes("tort_and_personal_injury"), "missing PI/tort domain", errors);
assert((artifact.arbiter_pipeline || []).includes("strict_priority_overrides"), "missing strict priority override stage", errors);
assert((artifact.task_taxonomy || []).includes("forms_documents"), "missing forms/documents task taxonomy", errors);
assert((artifact.posture_taxonomy || []).includes("defendant_accused_suspect"), "missing accused/suspect posture", errors);

const overrides = artifact.strict_priority_overrides || [];
assert(overrides.some(rule => rule.rule_id === "criminal_public_order_override"), "missing public-order criminal override", errors);
assert(overrides.some(rule => rule.rule_id === "civil_compensation_override"), "missing civil compensation override", errors);
assert((artifact.regression_seed_queries || []).some(test => String(test.query || "").includes("Harcourt Road")), "missing Harcourt Road regression seed", errors);

if (errors.length) {
  console.error("NotebookLM domain arbiter candidate validation failed:");
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  artifact_id: artifact.artifact_id,
  domains: artifact.top_level_domains.length,
  overrides: overrides.length,
  regression_seed_queries: (artifact.regression_seed_queries || []).length,
}, null, 2));
