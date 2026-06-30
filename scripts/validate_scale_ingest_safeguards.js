#!/usr/bin/env node
/* eslint-disable no-console */

const path = require("path");
const {
  buildRetrievalScopeFilter,
  postScaleSafeguardReport,
  validateManifestDoctrineAllowlist,
  validateNeutralCitation,
  validateShardRegistryScope,
  validateSourceCitationRecord,
  validateTreeNodeTargets,
} = require("../src/case_graph/scale_ingest_safeguards");
const { loadEnv } = require("../src/case_graph/scale_readiness");

const ROOT = path.resolve(__dirname, "..");
const BATCH = path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "bail_public_batch_v1");

function readJson(filePath) {
  return JSON.parse(require("fs").readFileSync(filePath, "utf8"));
}

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

const errors = [];
const env = loadEnv({ root: ROOT });
const manifest = readJson(path.join(BATCH, "source_manifest.json"));
const propositions = readJson(path.join(BATCH, "proposition_cards.json"));

assert(validateNeutralCitation("[2021] HKCFA 3") === "", "valid HK neutral citation should pass", errors);
assert(validateNeutralCitation("HKCFA 3") !== "", "bare citation should fail", errors);

for (const source of manifest.sources || []) {
  const sourceErrors = validateSourceCitationRecord(source);
  assert(sourceErrors.length === 0, `${source.source_id}: citation/source validation failed`, errors);
}

const manifestErrors = validateManifestDoctrineAllowlist(manifest, propositions.proposition_cards || []);
assert(manifestErrors.length === 0, "manifest doctrine allow-list should pass for bail batch", errors);

const treeErrors = validateTreeNodeTargets(["criminal_evidence.bail", "tort_law.negligence"]);
assert(treeErrors.length === 1, "forbidden tree node should be detected", errors);

const filter = buildRetrievalScopeFilter({ ...env, LEGAL_RUNTIME_MODE: "production_scale" });
assert((filter.must || []).some(item => item.key === "domain_id"), "production retrieval filter should lock domain_id", errors);
assert((filter.must || []).some(item => item.key === "practice_area"), "production retrieval filter should lock practice_area", errors);

const shardScope = validateShardRegistryScope({
  plan: { scope: "criminal_domain_public_cases" },
  shard: { case_ordinal_start: 1, case_ordinal_end: 5 },
});
assert(shardScope.seeded_cases.length > 0, "registry shard scope should find seeded cases", errors);
assert(shardScope.ok, `registry shard scope should pass: ${JSON.stringify(shardScope.errors)}`, errors);

const report = postScaleSafeguardReport({ ...env, LEGAL_RUNTIME_MODE: "production_scale" });
assert(report.criminal_domain_lock === true, "criminal domain lock expected in production", errors);

if (errors.length) {
  console.error("Scale ingest safeguard validation failed:");
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "passed",
  safeguard_report: report,
  retrieval_filter: filter,
  shard_scope_sample: {
    seeded_cases: shardScope.seeded_cases.length,
    batch_ids: shardScope.batch_ids,
  },
}, null, 2));
