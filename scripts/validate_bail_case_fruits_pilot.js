#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");
const { collectDomain } = (() => {
  function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  }
  function collect(domainDir, domainId) {
    const manifest = readJson(path.join(domainDir, "consolidated.json"));
    const ids = new Set();
    for (const section of manifest.sections || []) {
      const nodes = readJson(path.join(domainDir, section.node_file)).nodes || [];
      nodes.forEach(node => ids.add(node.doctrine_node_id || `${domainId}.${node.id}`));
    }
    return ids;
  }
  return { collectDomain: collect };
})();

const ROOT = path.resolve(__dirname, "..");
const PILOT = path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "bail_pilot");
const DOMAIN_DIR = path.join(ROOT, "data", "legal_domain_packs", "demo_maps", "criminal_procedure_hk");
const doctrineIds = collectDomain(DOMAIN_DIR, "criminal_procedure_hk");
const manifest = JSON.parse(fs.readFileSync(path.join(PILOT, "pilot_manifest.json"), "utf8"));
const links = JSON.parse(fs.readFileSync(path.join(PILOT, "proposition_node_links.json"), "utf8")).proposition_node_links || [];
const l4 = JSON.parse(fs.readFileSync(path.join(PILOT, "l4_case_applications.json"), "utf8")).l4_case_applications || [];
const l5 = JSON.parse(fs.readFileSync(path.join(PILOT, "l5_paragraph_proof.json"), "utf8")).l5_paragraph_proof || [];
const errors = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

assert(manifest.scope === "bail_only", "pilot must be bail_only");
assert(manifest.source_policy?.public_demo_only === true, "pilot must be public demo only");
assert(manifest.source_policy?.private_or_licensed_sources_allowed === false, "private/licensed sources must be blocked");
assert(manifest.source_policy?.bulk_auto_attach_allowed === false, "bulk auto attach must be blocked");
assert(links.length >= 2, "expected links to at least two bail doctrine nodes");
assert(l4.length >= 1, "expected at least one L4 application");
assert(l5.length >= 1, "expected at least one L5 paragraph proof card");

for (const link of links) {
  assert(doctrineIds.has(link.doctrine_node_id), `${link.link_id}: unknown doctrine_node_id ${link.doctrine_node_id}`);
  assert(link.review_status === "machine_candidate", `${link.link_id}: pilot links must remain machine_candidate`);
  assert(link.answer_layer_status === "candidate_only", `${link.link_id}: pilot links must be candidate_only`);
  assert(link.human_review_required === true, `${link.link_id}: human review required`);
  assert(link.source_visibility === "public_demo" && link.tenant_id === "public", `${link.link_id}: source visibility/tenant mismatch`);
}

for (const proof of l5) {
  assert(proof.quote_verified_against_fixture === true, `${proof.l5_proof_id}: quote must be verified against fixture paragraph`);
  assert(proof.answer_layer_status === "candidate_only", `${proof.l5_proof_id}: L5 proof must be candidate_only`);
}

if (errors.length) {
  console.error("Bail case fruits pilot validation failed:");
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log("Bail case fruits pilot validation passed.");
