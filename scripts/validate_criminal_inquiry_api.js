#!/usr/bin/env node
/* Validate criminal-law routing through the inquiry API. */

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
        if (this.statusCode >= 400) reject(new Error(`HTTP ${this.statusCode}`));
        else resolve(payload);
      },
    };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

function blob(value) {
  return JSON.stringify(value || {}).toLowerCase();
}

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

(async () => {
  const errors = [];
  const payload = await run("If I am alleged to be Stealing something in the convenient store, but i try to argue i just forgot to pay");
  const text = blob(payload);
  const matched = payload.matched_doctrine_nodes || [];
  const matchedIds = matched.map(node => node.doctrine_node_id);
  const matchedDomains = new Set(matched.map(node => node.domain_id));

  assert(payload.classification?.matter_type === "criminal_law", "theft query not routed to criminal law", errors);
  assert(payload.classification?.scenario === "theft_property_dishonesty", `wrong scenario ${payload.classification?.scenario}`, errors);
  assert(payload.classification?.subscenario === "shoplifting_forgot_to_pay_mr_defence", `wrong subscenario ${payload.classification?.subscenario}`, errors);
  assert((payload.detected_domains || []).includes("criminal_law_hk"), "criminal law domain not detected", errors);
  assert(!matchedDomains.has("tort_law_hk"), "tort node leaked into theft query", errors);
  assert(!matchedDomains.has("civil_procedure_hk"), "civil procedure node leaked into theft query", errors);
  assert(!matchedDomains.has("probate_law_hk"), "probate node leaked into theft query", errors);
  assert(matchedIds.includes("criminal_law_hk.theft"), "missing theft node", errors);
  assert(matchedIds.includes("criminal_law_hk.theft.dishonesty"), "missing dishonesty node", errors);
  assert(matchedIds.includes("criminal_law_hk.theft.appropriation"), "missing appropriation node", errors);
  assert(matchedIds.includes("criminal_law_hk.theft.intent.deprive"), "missing intent-deprive node", errors);
  for (const term of ["ar / mr matrix", "theft ordinance", "cap. 210", "dishonesty", "intention permanently to deprive", "forgot", "cctv", "prosecution must prove"]) {
    assert(text.includes(term), `missing answer term ${term}`, errors);
  }
  for (const term of ["interim payment", "provisional damages", "vasily trubnikov", "causation: but-for", "restaurant wet-floor"]) {
    assert(!text.includes(term), `leaked unrelated term ${term}`, errors);
  }

  if (errors.length) {
    console.error("Criminal inquiry API validation failed:");
    errors.forEach(error => console.error(`- ${error}`));
    process.exit(1);
  }
  console.log("Criminal inquiry API validation passed.");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
