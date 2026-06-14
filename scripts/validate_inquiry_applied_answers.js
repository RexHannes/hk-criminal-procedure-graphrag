#!/usr/bin/env node
/* Validate applied-answer response shape across inquiry domains. */

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

  const pi = await run("Passenger injured in a taxi road traffic collision. What evidence and forms are needed?");
  assert(pi.applied_answer?.title?.includes("Road Traffic"), "PI/RTA top-level applied answer missing", errors);
  assert(pi.classification?.scenario === "road_traffic_passenger_or_road_user", "PI/RTA classification missing", errors);
  assert(!!pi.pi_workflow, "PI/RTA workflow missing", errors);

  const criminal = await run("My client was arrested and asks about bail. What should we prepare?");
  assert(criminal.applied_answer?.title?.includes("Bail"), "Criminal bail applied answer missing", errors);
  assert(criminal.classification?.scenario === "bail_or_release", "Criminal bail classification missing", errors);
  assert(blob(criminal.applied_answer).includes("charge sheet"), "Criminal bail answer lacks document checklist", errors);

  const company = await run("We need a winding-up demand and petition route. Which form should I use?");
  assert(company.applied_answer?.title?.includes("Winding-Up"), "Company/forms applied answer missing", errors);
  assert(company.classification?.scenario === "winding_up_or_statutory_demand", "Company/forms classification missing", errors);
  assert(blob(company.applied_answer).includes("missing template"), "Company/forms answer lacks no-template gate", errors);

  if (errors.length) {
    console.error("Inquiry applied-answer validation failed:");
    errors.forEach(error => console.error(`- ${error}`));
    process.exit(1);
  }

  console.log("Inquiry applied-answer validation passed.");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
