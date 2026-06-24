#!/usr/bin/env node
/* Regression test: data-privacy questions route to data_privacy_hk and surface paragraph proof. */

const handler = require("../api/search-evidence.js");

function run(query) {
  return new Promise((resolve, reject) => {
    const req = { method: "GET", query: { q: query } };
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        if (this.statusCode >= 400) reject(new Error(`HTTP ${this.statusCode}: ${JSON.stringify(payload)}`));
        else resolve(payload);
      },
    };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

(async () => {
  const errors = [];
  const query = "Under the PDPO, when is collecting employee medical records unfair or excessive under DPP1?";
  const payload = await run(query);
  const matched = payload.matched_doctrine_nodes || [];
  const domains = new Set(matched.map(item => item.domain_id));
  const evidence = matched.flatMap(item => item.evidence || []);
  const matchedBlob = JSON.stringify(matched).toLowerCase();

  assert(payload.arbiter_trace?.selected_domain === "data_privacy", "arbiter should select data_privacy", errors);
  assert(domains.has("data_privacy_hk"), "matched nodes should include data_privacy_hk", errors);
  assert(!domains.has("probate_law_hk"), "probate leakage detected", errors);
  assert(!domains.has("tort_law_hk"), "PI/tort leakage detected", errors);
  assert(!domains.has("criminal_law_hk"), "criminal-law leakage detected", errors);
  assert(matched.some(item => item.doctrine_node_id === "data_privacy_hk.dpp1.collection_purpose"), "missing DPP1 purpose node", errors);
  assert(matched.some(item => item.doctrine_node_id === "data_privacy_hk.dpp1.collection_fairness"), "missing DPP1 fairness node", errors);
  assert(matched.some(item => item.doctrine_node_id === "data_privacy_hk.employment.medical_records"), "missing employment medical-records node", errors);
  assert(evidence.some(item => item.neutral_citation === "[2008] 5 HKLRD 539" && item.para_no === "4"), "missing Cathay para 4 evidence", errors);
  assert(evidence.some(item => item.neutral_citation === "[2008] 5 HKLRD 539" && item.para_no === "5"), "missing Cathay para 5 evidence", errors);
  assert(evidence.some(item => item.answer_layer_status === "source_verified" && item.source_url), "expected source-verified evidence with URL", errors);
  assert(!matchedBlob.includes("probate triage") && !matchedBlob.includes("wet floor") && !matchedBlob.includes("unlawful assembly"), "wrong-domain content leaked into data privacy results", errors);

  if (errors.length) {
    console.error("Data-privacy inquiry validation failed:");
    errors.forEach(error => console.error(`- ${error}`));
    console.error(JSON.stringify({
      arbiter: payload.arbiter_trace,
      domains: [...domains],
      matched: matched.map(item => ({
        id: item.doctrine_node_id,
        title: item.title,
        domain: item.domain_id,
        coverage: item.coverage_status,
        evidence: (item.evidence || []).map(ev => ({
          cite: ev.neutral_citation,
          para: ev.para_no,
          status: ev.answer_layer_status,
        })),
      })),
    }, null, 2));
    process.exit(1);
  }

  console.log("Data-privacy inquiry validation passed: DPP1 route surfaces source-verified paragraph proof.");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
