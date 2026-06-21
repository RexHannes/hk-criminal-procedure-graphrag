#!/usr/bin/env node
/* eslint-disable no-console */

const {
  assertAllowedPublicSourceUrl,
  buildBranchSearchQueries,
  isAllowedPublicSourceUrl,
  loadBrowserDiscoveryPolicy,
  normalizeCaseSeed,
  validateLineageEvidence,
  verifyPublicCaseCandidate,
} = require("../src/case_graph/browser_guided_discovery");

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

const errors = [];
const policy = loadBrowserDiscoveryPolicy();

assert(policy.policy_id === "case_fruit_browser_guided_discovery_v1", "unexpected policy id", errors);
assert(policy.browser_mode === "allowlisted_discovery_only", "browser mode must be allowlisted discovery only", errors);
assert((policy.allowed_domains || []).includes("legalref.judiciary.hk"), "legalref allowlist missing", errors);
assert((policy.disallowed_behaviour || []).includes("captcha_bypass"), "captcha bypass must be disallowed", errors);
assert((policy.disallowed_behaviour || []).includes("answer_safe_promotion"), "answer-safe promotion must be disallowed", errors);
assert(policy.answer_safe_promotion_allowed === false, "browser discovery must not promote answer_safe", errors);
assert(policy.rate_limits?.max_searches_per_run <= 50, "max searches per run too high", errors);
assert(policy.rate_limits?.delay_seconds_between_fetches >= 5, "fetch delay too low", errors);

assert(isAllowedPublicSourceUrl("https://legalref.judiciary.hk/lrs/common/ju/ju_frame.jsp"), "legalref URL should be allowed", errors);
assert(!isAllowedPublicSourceUrl("https://example.com/not-law"), "non-allowlisted URL should be rejected", errors);
try {
  assertAllowedPublicSourceUrl("https://example.com/not-law");
  errors.push("assertAllowedPublicSourceUrl should reject non-allowlisted URL");
} catch {
  // expected
}

const deepseekSeed = normalizeCaseSeed({
  case_name: "Imaginary Bail Case v HKSAR",
  possible_citation: "[2099] HKCFA 999",
  reason_for_relevance: "DeepSeek suggested it",
}, {
  branchId: "criminal_procedure_hk.bail_factors",
  source: "deepseek",
  policy,
});
assert(deepseekSeed.status === "llm_unverified_seed", "DeepSeek case seed must remain llm_unverified_seed", errors);
assert(deepseekSeed.answer_layer_status === "research_only", "DeepSeek seed must be research_only", errors);

const verified = verifyPublicCaseCandidate({
  case_name: "HKSAR v Lai Chee Ying",
  possible_citation: "[2021] HKCFA 3",
  source_url: "https://legalref.judiciary.hk/lrs/common/ju/ju_frame.jsp",
}, {
  fetchedText: "Court of Final Appeal judgment text",
  policy,
});
assert(verified.status === "verified_public_case", `public candidate should verify, got ${verified.status}`, errors);
assert(verified.source_checksum, "verified public case should have checksum", errors);
assert(verified.answer_layer_status === "research_only", "verified public case should not become answer_safe", errors);

const badVerified = verifyPublicCaseCandidate({
  case_name: "Fake Case",
  possible_citation: "[2099] HKFAKE 1",
  source_url: "https://example.com/fake",
}, { fetchedText: "fake", policy });
assert(badVerified.status === "rejected", "outside allowlist candidate must be rejected", errors);
assert(badVerified.verification_errors.includes("source_url_not_allowlisted"), "outside allowlist error missing", errors);

const queries = buildBranchSearchQueries({
  branchId: "criminal_procedure_hk.bail_factors",
  label: "Bail Factors",
  statuteRefs: ["Cap 221 s.9D"],
  seedTerms: ["risk of absconding"],
});
assert(queries.length > 0, "branch search queries missing", errors);
assert(queries.every(item => item.status === "tree_query_seed"), "deterministic branch queries should be tree_query_seed", errors);
assert(queries.some(item => item.query.includes("site:legalref.judiciary.hk")), "legalref targeted query missing", errors);

const supportedLineage = validateLineageEvidence({
  judgmentText: "The court considered HKSAR v Lai Chee Ying and applied the test.",
  citedCase: "HKSAR v Lai Chee Ying",
  relation: "applied",
  policy,
});
assert(supportedLineage.ok, "lineage should pass when cited case and relation appear in judgment text", errors);

const unsupportedLineage = validateLineageEvidence({
  judgmentText: "The court gave reasons on bail.",
  citedCase: "HKSAR v Lai Chee Ying",
  relation: "applied",
  policy,
});
assert(!unsupportedLineage.ok, "LLM-only lineage should be rejected without judgment text support", errors);

if (errors.length) {
  console.error("Browser-guided discovery validation failed:");
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log("Browser-guided discovery validation passed.");
