#!/usr/bin/env node
/* Validate the user-facing PI inquiry response shape. */

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
  const payload = await run("I am restaurant owner, customer slipped over water in my restaurant after mopping the floor but should be dried. What should I do? Should I wait for lawyer letter? How much compensation?");
  const workflow = payload.pi_workflow;
  assert(!!workflow, "missing pi_workflow", errors);
  assert(workflow?.classification?.scenario === "premises_wet_floor_slip", "wrong scenario classification", errors);
  assert(workflow?.classification?.user_perspective === "defendant_occupier", "wrong user perspective", errors);
  assert(!!workflow?.applied_triage?.short_answer, "missing applied triage short answer", errors);
  assert(blob(workflow?.applied_triage).includes("do not simply wait"), "short answer does not address waiting for solicitor letter", errors);
  assert(blob(workflow?.applied_triage).includes("notify your insurer"), "missing insurer notification guidance", errors);
  assert(blob(workflow?.applied_triage).includes("warning"), "missing warning/sign analysis", errors);
  assert(blob(workflow?.applied_triage).includes("no sensible compensation estimate"), "missing quantum caveat", errors);
  assert((workflow?.evidence_plan || []).length >= 4, "insufficient evidence plan", errors);
  assert((workflow?.quantum_and_consequences || []).length >= 3, "insufficient quantum section", errors);
  assert((workflow?.next_procedure_steps || []).length >= 5, "insufficient next steps", errors);
  assert((workflow?.excluded_as_irrelevant || []).includes("road_traffic"), "road traffic not excluded", errors);
  assert((workflow?.excluded_as_irrelevant || []).includes("workplace_employers_liability"), "workplace not excluded", errors);
  const rawTitles = [
    ...(workflow?.principles || []),
    ...(workflow?.procedures_forms || []),
  ].map(item => item.title || "").join(" | ").toLowerCase();
  assert(rawTitles.includes("occupier") || rawTitles.includes("occupiers"), "occupiers issue not retrieved", errors);
  assert(!rawTitles.includes("safe plant"), "irrelevant workplace safe plant leaked into PI workflow", errors);

  if (errors.length) {
    console.error("PI inquiry API validation failed:");
    errors.forEach(error => console.error(`- ${error}`));
    process.exit(1);
  }
  console.log("PI inquiry API validation passed: restaurant-owner wet-floor applied triage.");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
