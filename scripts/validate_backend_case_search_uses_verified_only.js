#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { searchParagraphLinkedCases, verifyEvidenceRecord } = require("../src/case_graph/case_authority_eval");
const { isVerifiedParagraphProof } = require("../src/case_graph/verified_case_authority");
const { evidenceForDoctrineNode } = require("../src/case_graph/case_authority_bridge");

const EXCLUDED = path.join(__dirname, "..", "artifacts", "excluded_unverified_case_seeds_report.json");
const excluded = new Set(JSON.parse(fs.readFileSync(EXCLUDED, "utf8")).records.map(r => r.doctrine_node_id));

const errors = [];
const demoQueries = [
  "HKSAR v Leung Kwok Hung",
  "bail factors theft",
  "peaceful protest assembly",
];

for (const query of demoQueries) {
  const { hits } = searchParagraphLinkedCases(query, { limit: 6 });
  for (const hit of hits) {
    const check = verifyEvidenceRecord(hit);
    if (!check.ok) errors.push(`${query}:hit:${check.errors.join(",")}`);
    if (excluded.has(hit.doctrine_node_id)) errors.push(`${query}:excluded_seed_leaked`);
    if (!isVerifiedParagraphProof(hit)) errors.push(`${query}:unverified_hit`);
  }
}

const backendNodes = [
  "criminal_procedure_hk.hksar_v_leung_kwok_hung",
  "criminal_procedure_hk.bail_factors",
  "criminal_law_hk.theft.dishonesty",
];
for (const nodeId of backendNodes) {
  const evidence = evidenceForDoctrineNode(nodeId);
  if (!evidence.length) continue;
  for (const item of evidence) {
    if (!isVerifiedParagraphProof({
      ...item,
      paragraph_number: item.para_no,
      exact_quote: item.exact_quote || item.supporting_quote,
    })) {
      errors.push(`backend_unverified:${nodeId}`);
    }
  }
}

if (errors.length) {
  console.error(JSON.stringify({ ok: false, errors }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, queries_checked: demoQueries.length, backend_nodes_checked: backendNodes.length }, null, 2));
