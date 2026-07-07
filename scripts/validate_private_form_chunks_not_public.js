#!/usr/bin/env node
const fs = require("fs");
const { execFileSync } = require("child_process");
const { assert } = require("./forms_cli_common");
const { loadFormStore } = require("../src/forms/form_system");
const { buildPrivateClauseVectorIndex } = require("../src/forms/private_clause_semantic_retrieval");

const trackedFiles = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split(/\r?\n/)
  .filter(Boolean);

const committedVectorFiles = trackedFiles.filter(file => /private_clause_vector_index\.json$/i.test(file));
assert(!committedVectorFiles.length, `Private clause vector index files must not be committed: ${committedVectorFiles.join(", ")}`);

for (const file of trackedFiles.filter(file => /^data\/(legal_ingest|legal_domain_packs|index\.json)/.test(file) && /\.(json|jsonl|md|js)$/i.test(file))) {
  const text = fs.readFileSync(file, "utf8");
  assert(!/PRIVATE_APPROVED_CLAUSE_CHUNK|private_clause_chunk:|private_form_recommendations/i.test(text), `${file} appears to expose private form chunks in public legal data`);
}

const reportFiles = [
  "artifacts/private_form_semantic_retrieval_report.json",
  "artifacts/private_form_semantic_retrieval_report.md",
  "artifacts/forms_as_code_snippets_report.json",
  "artifacts/forms_as_code_snippets_report.md",
];

for (const file of reportFiles) {
  assert(fs.existsSync(file), `Expected report missing: ${file}`);
  const text = fs.readFileSync(file, "utf8");
  assert(!/"text"\s*:/i.test(text), `${file} must not expose private chunk text`);
  assert(!/Dear Sirs|WITHOUT PREJUDICE|\bAtkins\b|Consultancy agreement|formw\d/i.test(text), `${file} appears to contain private text`);
}

const semanticReport = JSON.parse(fs.readFileSync("artifacts/private_form_semantic_retrieval_report.json", "utf8"));
assert(semanticReport.committed_private_chunks === false, "Semantic report must state private chunks are not committed");
assert(semanticReport.public_authority === false, "Semantic retrieval must not be public authority");
assert(semanticReport.vector_index.raw_text_stored === false, "Vector index must not store raw private text");

const store = loadFormStore("fixtures/forms/private_lane_company_winding_up_store");
const index = buildPrivateClauseVectorIndex(store);
assert(index.chunks.every(chunk => !Object.prototype.hasOwnProperty.call(chunk, "text")), "Private chunk records must not have text property");
assert(index.chunks.every(chunk => chunk.publicAuthority === false), "Private chunks cannot be public authority");
assert(index.chunks.every(chunk => (chunk.legalKnowledgeNodeIds || []).every(id => /^[a-z0-9_.:-]+$/i.test(id))), "Legal tree cross-links must be IDs only");

console.log("private form chunks not public ok");
