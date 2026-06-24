#!/usr/bin/env node
/* Regression test: public-order criminal questions must not route to PI. */

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

function blob(value) {
  return JSON.stringify(value || {}).toLowerCase();
}

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

(async () => {
  const errors = [];
  const query = "If politically in 2019 I went to Harcourt Road in black and handed water to protestors, but I did not know and supposedly I am concealed, but I still get caught, is it most likely I will be unlawful assembly or riot?";
  const payload = await run(query);
  const answerBlob = blob(payload.applied_answer);
  const matchedBlob = blob(payload.matched_doctrine_nodes);

  assert(!payload.pi_workflow, "PI workflow must not be enabled for public-order criminal query", errors);
  assert(payload.classification?.matter_type === "criminal_law", "classification should be criminal_law", errors);
  assert(payload.classification?.scenario === "public_order_unlawful_assembly_riot", "wrong criminal public-order scenario", errors);
  assert(payload.applied_answer?.title?.includes("Public Order"), "missing public-order applied answer", errors);
  assert(answerBlob.includes("unlawful assembly") && answerBlob.includes("riot"), "answer missing unlawful assembly/riot analysis", errors);
  assert(answerBlob.includes("handing water") || answerBlob.includes("water"), "answer missing water-assistance application", errors);
  assert(answerBlob.includes("not a personal-injury") || answerBlob.includes("not a personal injury"), "answer should expressly reject PI framing", errors);
  assert((payload.answer_contract?.excluded_issue_families || []).includes("personal_injury"), "answer contract should exclude personal injury", errors);
  assert(!matchedBlob.includes("personal injury triage"), "matched nodes should not contain PI triage", errors);
  assert(!matchedBlob.includes("occupiers") && !matchedBlob.includes("wet floor"), "premises PI leakage detected", errors);
  assert(matchedBlob.includes("public_order") || matchedBlob.includes("joint enterprise") || matchedBlob.includes("riot"), "missing public-order/criminal-law matches", errors);

  if (errors.length) {
    console.error("Public-order inquiry validation failed:");
    errors.forEach(error => console.error(`- ${error}`));
    console.error(JSON.stringify({
      classification: payload.classification,
      pi_workflow: !!payload.pi_workflow,
      applied_title: payload.applied_answer?.title,
      matched: (payload.matched_doctrine_nodes || []).map(item => ({
        id: item.doctrine_node_id,
        title: item.title,
        domain: item.domain_id,
      })),
    }, null, 2));
    process.exit(1);
  }

  console.log("Public-order inquiry validation passed: criminal-law route suppresses PI.");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
