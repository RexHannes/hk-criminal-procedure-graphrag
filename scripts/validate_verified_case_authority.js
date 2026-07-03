#!/usr/bin/env node
/**
 * CI gate: visible/searchable case authorities must be verified paragraph proof or excluded.
 */
const fs = require("fs");
const path = require("path");
const {
  resolveAllVisibleCaseSources,
  loadViewerEvidenceIndex,
  collectCaseLikeInventory,
  isVerifiedParagraphProof,
  authoritySummaryStats,
  VIEWER_EVIDENCE_INDEX_PATH,
  EXCLUDED_REPORT_JSON,
} = require("../src/case_graph/verified_case_authority");
const { evidenceForDoctrineNode } = require("../src/case_graph/case_authority_bridge");

const ROOT = path.resolve(__dirname, "..");
const errors = [];
function assert(cond, msg) {
  if (!cond) errors.push(msg);
}

if (!fs.existsSync(VIEWER_EVIDENCE_INDEX_PATH)) {
  resolveAllVisibleCaseSources({ write: true });
}
const index = loadViewerEvidenceIndex({ refresh: true });
const inventory = collectCaseLikeInventory();
const verifiedSeedIds = new Set(index.verified_case_seed_ids || []);
const excluded = JSON.parse(fs.readFileSync(EXCLUDED_REPORT_JSON, "utf8"));

for (const record of index.records || []) {
  assert(isVerifiedParagraphProof(record), `index record not verified: ${record.paragraph_id || record.case_id}`);
  assert(record.source_url, `missing source_url: ${record.paragraph_id || record.case_id}`);
  assert(record.paragraph_number, `missing paragraph_number: ${record.paragraph_id || record.case_id}`);
  assert(record.exact_quote, `missing exact_quote: ${record.paragraph_id || record.case_id}`);
  assert(record.short_application_summary || record.proposition_text, `missing summary: ${record.paragraph_id || record.case_id}`);
}

const visibleUnverified = inventory.filter(seed => !verifiedSeedIds.has(seed.doctrine_node_id) && !excluded.records.some(e => e.doctrine_node_id === seed.doctrine_node_id));
assert(visibleUnverified.length === 0, `case seeds must be verified or excluded: ${visibleUnverified.slice(0, 5).map(s => s.doctrine_node_id).join(", ")}`);

for (const seed of inventory.filter(s => verifiedSeedIds.has(s.doctrine_node_id))) {
  const apiEvidence = evidenceForDoctrineNode(seed.doctrine_node_id);
  const verifiedApi = apiEvidence.filter(isVerifiedParagraphProof);
  assert(verifiedApi.length > 0, `backend searchable unverified for ${seed.doctrine_node_id}`);
}

const demoNodes = [
  "criminal_procedure_hk.hksar_v_leung_kwok_hung",
  "criminal_procedure_hk.bail_right_to_bail",
  "criminal_procedure_hk.invest_search_without_warrant",
];
for (const nodeId of demoNodes) {
  const hits = (index.by_doctrine_node_id || {})[nodeId] || [];
  if (nodeId.includes("leung_kwok_hung") || nodeId.includes("bail_right")) {
    assert(hits.length > 0, `AI inquiry demo node missing verified evidence: ${nodeId}`);
  }
}

const appJs = fs.readFileSync(path.join(ROOT, "viewer", "app.js"), "utf8");
assert(!appJs.includes("Verification pending"), "viewer still contains Verification pending label");
assert(!appJs.includes("Case audit required"), "viewer still contains Case audit required label");
assert(appJs.includes("verifiedCaseSeedIds"), "viewer missing verifiedCaseSeedIds filter");

const stats = authoritySummaryStats();
assert(stats.total_still_visible_unverified === 0, `stats report visible unverified ${stats.total_still_visible_unverified}`);

if (errors.length) {
  console.error(JSON.stringify({ ok: false, errors, stats }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, stats, excluded: excluded.total_excluded }, null, 2));
