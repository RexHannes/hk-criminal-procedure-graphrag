#!/usr/bin/env node
/* Regression test: civil-procedure inconsistent-position questions stay in civil_procedure_hk and show paragraph proof. */

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
  const query = "What is the consequence for inconsistent factual pleadings across two proceedings: abuse of process, estoppel or collateral attack?";
  const payload = await run(query);
  const matched = payload.matched_doctrine_nodes || [];
  const domains = new Set(matched.map(item => item.domain_id));
  const evidence = matched.flatMap(item => item.evidence || []);
  const matchedBlob = JSON.stringify(matched).toLowerCase();

  assert(payload.arbiter_trace?.selected_domain === "civil_procedure", "arbiter should select civil_procedure", errors);
  assert(domains.has("civil_procedure_hk"), "matched nodes should include civil_procedure_hk", errors);
  assert(!domains.has("probate_law_hk"), "probate leakage detected", errors);
  assert(!domains.has("tort_law_hk"), "PI/tort leakage detected", errors);
  assert(!domains.has("criminal_law_hk"), "criminal-law leakage detected", errors);
  assert(!domains.has("criminal_procedure_hk"), "criminal-procedure leakage detected", errors);
  assert(!domains.has("data_privacy_hk"), "data-privacy leakage detected", errors);

  assert(
    matched.some(item => item.doctrine_node_id === "civil_procedure_hk.abuse_process.inconsistent_positions"),
    "missing inconsistent-positions abuse node",
    errors
  );
  assert(
    matched.some(item => item.doctrine_node_id === "civil_procedure_hk.estoppel.res_judicata"),
    "missing estoppel/res judicata node",
    errors
  );
  assert(
    matched.some(item => item.doctrine_node_id === "civil_procedure_hk.pleadings.alternative_cases_within_knowledge"),
    "missing alternative-pleading/within-knowledge node",
    errors
  );

  assert(
    evidence.some(item => item.neutral_citation === "[2020] HKCFI 2215" && item.para_no === "31" && item.source_url),
    "missing Re Minloy para 31 evidence",
    errors
  );
  assert(
    evidence.some(item => item.neutral_citation === "[2022] HKCFI 381" && item.para_no === "43" && item.source_url),
    "missing Lancom para 43 evidence",
    errors
  );
  assert(
    evidence.some(item => item.neutral_citation === "[2023] HKCFI 1463" && item.para_no === "16" && item.source_url),
    "missing Liu Hao Tsing para 16 evidence",
    errors
  );
  assert(
    evidence.some(item => item.answer_layer_status === "paragraph_verified" && item.quote_verified === true),
    "expected paragraph-verified evidence",
    errors
  );
  assert(
    !matchedBlob.includes("probate triage") &&
      !matchedBlob.includes("wet floor") &&
      !matchedBlob.includes("unlawful assembly") &&
      !matchedBlob.includes("personal injury"),
    "wrong-domain content leaked into civil procedure results",
    errors
  );

  if (errors.length) {
    console.error("Civil-procedure inquiry validation failed:");
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
          url: Boolean(ev.source_url),
        })),
      })),
    }, null, 2));
    process.exit(1);
  }

  console.log("Civil-procedure inquiry validation passed: inconsistent-positions route surfaces paragraph proof.");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
