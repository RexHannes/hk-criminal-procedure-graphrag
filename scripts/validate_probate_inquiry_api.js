#!/usr/bin/env node
/* Validate Probate domain routing through the inquiry API. */

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
  const queries = [
    {
      query: "My client is executor under a will and needs probate in Hong Kong. What should we do and which forms?",
      scenario: "common_form_probate_grant",
      must: ["executor", "assets", "metadata"],
    },
    {
      query: "There is a caveat and warning in a probate matter. What happens next?",
      scenario: "caveat_warning_contentious_gateway",
      must: ["caveat", "warning", "contentious"],
    },
    {
      query: "We have a foreign grant and Hong Kong bank assets. Is resealing needed?",
      scenario: "foreign_grant_resealing",
      must: ["foreign grant", "hong kong assets", "resealing"],
    },
  ];
  const errors = [];
  for (const item of queries) {
    const payload = await run(item.query);
    const text = blob(payload);
    assert(payload.classification?.matter_type === "probate", `${item.scenario}: not routed to probate`, errors);
    assert(payload.classification?.scenario === item.scenario, `${item.scenario}: wrong scenario ${payload.classification?.scenario}`, errors);
    assert((payload.detected_domains || []).includes("probate_law_hk"), `${item.scenario}: probate domain not detected`, errors);
    assert(payload.applied_answer?.mode === "probate_metadata_source_gated", `${item.scenario}: wrong answer mode`, errors);
    assert((payload.form_candidates || []).length >= 1, `${item.scenario}: missing form candidates`, errors);
    assert(payload.source_audit?.display === "collapsed", `${item.scenario}: source audit not collapsed`, errors);
    for (const term of item.must) {
      assert(text.includes(term), `${item.scenario}: missing ${term}`, errors);
    }
    assert(!text.includes("restaurant wet-floor"), `${item.scenario}: leaked PI restaurant language`, errors);
    assert(!text.includes("road traffic collision"), `${item.scenario}: leaked PI RTA language`, errors);
  }

  if (errors.length) {
    console.error("Probate inquiry API validation failed:");
    errors.forEach(error => console.error(`- ${error}`));
    process.exit(1);
  }
  console.log("Probate inquiry API validation passed.");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
