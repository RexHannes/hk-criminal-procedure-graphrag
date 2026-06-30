#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");
const {
  buildRetrievalScopeFilter,
  postScaleSafeguardReport,
  validateForbiddenIssueFamilies,
  validateManifestDoctrineAllowlist,
  validateShardRegistryScope,
  validateSourceCitationRecord,
} = require("../src/case_graph/scale_ingest_safeguards");

const ROOT = path.resolve(__dirname, "..");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function arrayFromPayload(payload, key) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.[key])) return payload[key];
  return [];
}

function loadBatch(batchDir) {
  const manifest = readJson(path.join(batchDir, "source_manifest.json"));
  const propositions = arrayFromPayload(readJson(path.join(batchDir, "proposition_cards.json")), "proposition_cards");
  const links = arrayFromPayload(readJson(path.join(batchDir, "proposition_node_links.json")), "proposition_node_links");
  return { manifest, propositions, links };
}

const errors = [];
function assert(condition, message) {
  if (!condition) errors.push(message);
}

const productionFilter = buildRetrievalScopeFilter({ runtimeMode: "production_scale" });
const serializedFilter = JSON.stringify(productionFilter);
assert(serializedFilter.includes("domain_id"), "production filter should include domain_id");
assert(serializedFilter.includes("practice_area"), "production filter should include practice_area");
assert(serializedFilter.includes("criminal_procedure_hk"), "production filter should include criminal_procedure_hk");
assert(serializedFilter.includes("criminal_law_hk"), "production filter should include criminal_law_hk");

const goodCitation = validateSourceCitationRecord({
  source_id: "s1",
  neutral_citation: "[2021] HKCFA 3",
  source_url_or_path: "https://legalref.judiciary.hk/lrs/common/search/search_result_detail_frame.jsp?DIS=133491&QS=%2B&TP=JU&ILAN=en",
  source_visibility: "public_demo",
  tenant_id: "public",
  licence_status: "public_judgment",
});
assert(goodCitation.ok, `expected good citation: ${JSON.stringify(goodCitation.errors)}`);
const badCitation = validateSourceCitationRecord({
  source_id: "bad",
  neutral_citation: "not a neutral citation",
  source_url_or_path: "https://example.com/case",
  source_visibility: "public_demo",
  tenant_id: "public",
  licence_status: "public_judgment",
});
assert(!badCitation.ok, "bad citation should fail");

const familyLeak = validateForbiddenIssueFamilies({
  propositions: [{ proposition_id: "p", target_doctrine_node_ids: ["probate_law_hk.common_grant"] }],
  links: [],
});
assert(!familyLeak.ok, "probate doctrine leakage should fail");

const allowlist = validateManifestDoctrineAllowlist({
  allowedDoctrineNodeIds: ["criminal_procedure_hk.nsl_bail"],
  propositions: [{ proposition_id: "p", target_doctrine_node_ids: ["criminal_procedure_hk.nsl_bail"] }],
  links: [{ link_id: "l", doctrine_node_id: "criminal_procedure_hk.nsl_bail" }],
});
assert(allowlist.ok, "allowlist positive case should pass");
const allowlistBad = validateManifestDoctrineAllowlist({
  allowedDoctrineNodeIds: ["criminal_procedure_hk.nsl_bail"],
  propositions: [{ proposition_id: "p", target_doctrine_node_ids: ["criminal_law_hk.sedition_public_expression"] }],
  links: [],
});
assert(!allowlistBad.ok, "allowlist negative case should fail");

const scopeBad = validateShardRegistryScope({
  registryCases: [{
    case_id: "x",
    scope: "probate",
    neutral_citation: "[2024] HKCFI 1",
    source_url_or_path: "https://legalref.judiciary.hk/lrs/common/search/search_result_detail_frame.jsp?DIS=1",
    source_visibility: "public_demo",
    tenant_id: "public",
    licence_status: "public_judgment",
  }],
  allowedScopes: ["bail_only"],
});
assert(!scopeBad.ok, "bad shard scope should fail");

const bailDir = path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "bail_public_batch_v1");
const bail = loadBatch(bailDir);
const bailReport = postScaleSafeguardReport({
  ...bail,
  allowedDoctrineNodeIds: [
    "criminal_procedure_hk.nsl_bail",
    "criminal_procedure_hk.bail_factors",
    "criminal_procedure_hk.bail_flow_step5",
    "criminal_procedure_hk.bail_right_to_bail",
  ],
});
assert(bailReport.status === "passed", `bail safeguard failed: ${JSON.stringify(bailReport.errors)}`);

for (const pilot of ["sedition_public_expression_v1", "public_order_riot_v1"]) {
  const pilotDir = path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "tree_gap_pilots", pilot);
  const batch = loadBatch(pilotDir);
  const report = postScaleSafeguardReport(batch);
  assert(report.status === "passed", `${pilot} safeguard failed: ${JSON.stringify(report.errors)}`);
}

if (errors.length) {
  console.error("Scale ingest safeguard validation failed:");
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log("Scale ingest safeguard validation passed.");
