#!/usr/bin/env node
/* eslint-disable no-console */

const path = require("path");

const ROOT = path.resolve(__dirname, "..");

const GOLDEN = [
  {
    id: "sedition_government_criticism",
    query: "If someone just criticizes government not doing job in the fire hazard, will it be sedition in HK?",
    expect_pi_workflow: false,
    expect_domain: "criminal_law",
    expect_arbiter_domain: "criminal_law",
    expect_title_includes: "Sedition",
    forbid_title_includes: "Probate",
    forbid_matched_domains: ["probate_law_hk", "tort_law_hk", "equity_trusts_hk", "hk_listing_and_listed_company_regulation"],
  },
  {
    id: "harcourt_road_water_protest_2019",
    query: "If politically in 2019 I went to harcourt road in black and handed water to protestors, but i did not know and also supposingly i am concealed, but i stil lget caught, is it most likely i will be unlawful assembly or riot?",
    expect_pi_workflow: false,
    expect_domain: "criminal_law",
    expect_arbiter_domain: "criminal_law",
    expect_title_includes: "Public Order",
    forbid_title_includes: "Premises Slip",
    forbid_matched_domains: ["probate_law_hk", "tort_law_hk", "equity_trusts_hk", "hk_listing_and_listed_company_regulation"],
  },
  {
    id: "wet_floor_restaurant_pi",
    query: "A customer slipped on a wet floor in my restaurant after we mopped; what should I do about the injury claim?",
    expect_pi_workflow: true,
    expect_domain: "personal_injury",
    expect_arbiter_domain: "personal_injury",
    expect_title_includes: "Wet-Floor",
    forbid_matched_domains: ["probate_law_hk", "criminal_law_hk", "criminal_procedure_hk"],
  },
];

async function runRoutingCase(testCase) {
  const handler = require(path.join(ROOT, "api", "search-evidence.js"));
  let payload = null;
  const req = { method: "GET", query: { q: testCase.query } };
  const res = {
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader() {},
    end() {},
    json(body) {
      payload = body;
    },
  };
  await handler(req, res);
  return payload;
}

async function main() {
  const errors = [];
  for (const testCase of GOLDEN) {
    const payload = await runRoutingCase(testCase);
    if (!payload) {
      errors.push(`${testCase.id}: no response payload`);
      continue;
    }
    const pi = Boolean(payload.pi_workflow);
    const title = String(payload.applied_answer?.title || "");
    const domain = payload.answer_contract?.domain || payload.classification?.matter_type || "";
    const arbiterDomain = payload.arbiter_trace?.selected_domain || "";
    const matchedDomains = new Set((payload.matched_doctrine_nodes || []).map(item => item.domain_id).filter(Boolean));

    if (pi !== testCase.expect_pi_workflow) {
      errors.push(`${testCase.id}: pi_workflow expected ${testCase.expect_pi_workflow}, got ${pi}`);
    }
    if (testCase.expect_domain && domain !== testCase.expect_domain) {
      errors.push(`${testCase.id}: domain expected ${testCase.expect_domain}, got ${domain || "(empty)"}`);
    }
    if (testCase.expect_arbiter_domain && arbiterDomain !== testCase.expect_arbiter_domain) {
      errors.push(`${testCase.id}: arbiter domain expected ${testCase.expect_arbiter_domain}, got ${arbiterDomain || "(empty)"}`);
    }
    if (testCase.expect_title_includes && !title.includes(testCase.expect_title_includes)) {
      errors.push(`${testCase.id}: title missing "${testCase.expect_title_includes}" (got "${title}")`);
    }
    if (testCase.forbid_title_includes && title.includes(testCase.forbid_title_includes)) {
      errors.push(`${testCase.id}: title must not include "${testCase.forbid_title_includes}"`);
    }
    for (const forbiddenDomain of testCase.forbid_matched_domains || []) {
      if (matchedDomains.has(forbiddenDomain)) {
        errors.push(`${testCase.id}: matched nodes must not include domain ${forbiddenDomain}`);
      }
    }
  }

  if (errors.length) {
    console.error(JSON.stringify({ validator: "inquiry_domain_routing_v1", status: "failed", errors }, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify({ validator: "inquiry_domain_routing_v1", status: "passed", cases: GOLDEN.length }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
