#!/usr/bin/env node
/* Validate that Qdrant retrieval returns source-card hits for the pilot query. */

const { spawnSync } = require("child_process");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const QUERY = "What is the consequence of inconsistent factual pleadings across more than one case? abuse of process estoppel";

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

const result = spawnSync(process.execPath, [
  path.join(ROOT, "scripts", "query_legal_qdrant.js"),
  "--query",
  QUERY,
  "--collection",
  "hk_proposition_cards",
  "--top-k",
  "5",
], {
  cwd: ROOT,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});

if (result.status !== 0) {
  console.error(result.stdout);
  console.error(result.stderr);
  process.exit(result.status || 1);
}

const payload = JSON.parse(result.stdout);
const errors = [];
const hits = payload.hits || [];
const propositionIds = hits.map(hit => hit.proposition_id).filter(Boolean);
const issueBlob = JSON.stringify(hits).toLowerCase();

assert(hits.length > 0, "expected at least one Qdrant hit", errors);
assert(
  propositionIds.includes("prop_inconsistent_positions_scope_minloy_p31") ||
    propositionIds.includes("prop_abuse_estoppel_lancom_p43") ||
    propositionIds.includes("prop_diametrically_opposed_integrity_vasily_p39"),
  "expected a core inconsistent-positions proposition card in top hits",
  errors
);
assert(issueBlob.includes("abuse_of_process") || issueBlob.includes("estoppel"), "expected abuse/estoppel issue tags", errors);
assert(hits.every(hit => hit.answer_layer_status), "every hit should include answer_layer_status", errors);
assert(hits.every(hit => hit.authority_role), "every hit should include authority_role", errors);

if (errors.length) {
  console.error("Qdrant retrieval smoke validation failed:");
  errors.forEach(error => console.error(`- ${error}`));
  console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
}

console.log("Qdrant retrieval smoke validation passed.");
