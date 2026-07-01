#!/usr/bin/env node
/* Validate the shared verified case-authority registry. */

const fs = require("fs");
const path = require("path");
const {
  hasVerifiedPublicParagraphAuthority,
  principleSummaryForAuthority,
  normalizeAuthorityForReport,
} = require("../src/case_graph/verified_case_authority");

const ROOT = path.resolve(__dirname, "..");
const REGISTRY_PATH = path.join(ROOT, "data", "legal_ingest", "case_authority_registry.json");
const errors = [];

function fail(message) {
  errors.push(message);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

const registry = readJson(REGISTRY_PATH);
const authorities = registry.authorities || [];
const byId = new Map(authorities.map(item => [item.authority_id, item]));

if (!authorities.length) fail("registry contains no paragraph-linked authorities");

for (const item of authorities) {
  const label = item.authority_id || item.evidence_id || item.case_name || "unknown";
  if (!hasVerifiedPublicParagraphAuthority(item)) {
    fail(`${label}: missing public URL, #p anchor, paragraph number, or exact quote support`);
  }
  if (!principleSummaryForAuthority(item)) fail(`${label}: missing short principle/proposition summary`);
  if (item.answer_safe === true) fail(`${label}: answer_safe must not be true`);
  if (item.answer_mode !== "research_prototype") fail(`${label}: answer_mode must be research_prototype`);
  if (item.professional_advice_certified !== false) fail(`${label}: professional_advice_certified must be false`);
}

for (const seed of registry.case_seed_nodes || []) {
  const ids = seed.verified_authority_ids || [];
  if (seed.product_status === "source_linked_public_judgment") {
    if (!ids.length) fail(`${seed.doctrine_node_id}: source-linked seed has no verified_authority_ids`);
    for (const id of ids) {
      const authority = byId.get(id);
      if (!authority) fail(`${seed.doctrine_node_id}: references missing authority ${id}`);
      else if (!hasVerifiedPublicParagraphAuthority(authority)) fail(`${seed.doctrine_node_id}: references unverified authority ${id}`);
    }
  }
  if (seed.product_status === "excluded_from_product_authority_surfaces" && ids.length) {
    fail(`${seed.doctrine_node_id}: excluded seed should not carry verified_authority_ids`);
  }
}

const counts = registry.counts || {};
if (counts.scanned_case_seed_count !== counts.source_linked_case_seed_count + counts.excluded_case_seed_count) {
  fail("case seed counts do not satisfy resolved-or-excluded invariant");
}
if ((registry.unresolved_case_seed_nodes || []).length !== counts.excluded_case_seed_count) {
  fail("unresolved case seed list length does not match excluded count");
}

const leungSeed = authorities.filter(item =>
  /Leung Kwok Hung/i.test(item.case_name || "") &&
  (item.doctrine_node_ids || []).includes("criminal_procedure_hk.hksar_v_leung_kwok_hung")
);
if (leungSeed.length !== 2) fail("Leung Kwok Hung 2005 seed proof must have exactly paras 17 and 18");
if (leungSeed.some(item => !/\[2005\] HKCFA 2/.test(item.neutral_citation || "") || !/DIS=45653/.test(item.source_url || ""))) {
  fail("Leung Kwok Hung 2005 seed proof must use the 2005 CFA judgment, not the 2021 bail judgment");
}
const lam = authorities.filter(item => /Lam Tat Ming/i.test(item.case_name || ""));
if (!lam.length) fail("Lam Tat Ming public paragraph proof is missing");
if (lam.some(item => !/DIS=33993/.test(item.source_url || ""))) fail("Lam Tat Ming proof must use LegalRef DIS=33993");

if (errors.length) {
  console.error("Verified case-authority validation failed:");
  errors.forEach(error => console.error(`- ${error}`));
  console.error("Sample authorities:");
  authorities.slice(0, 3).forEach(item => console.error(JSON.stringify(normalizeAuthorityForReport(item), null, 2)));
  process.exit(1);
}

console.log(`Verified case-authority validation passed for ${authorities.length} public paragraph records.`);
