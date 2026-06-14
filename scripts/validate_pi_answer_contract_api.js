#!/usr/bin/env node
/* Validate PI answer contracts suppress scenario leakage before rendering source chunks. */

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

function auditBlob(workflow) {
  return JSON.stringify([
    ...(workflow?.principles || []),
    ...(workflow?.procedures_forms || []),
    ...(workflow?.verification || []),
  ]).toLowerCase();
}

function workflowBlob(workflow) {
  return JSON.stringify(workflow || {}).toLowerCase();
}

function answerBlob(payload) {
  return JSON.stringify(payload?.applied_answer || payload?.pi_workflow?.applied_answer || {}).toLowerCase();
}

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

function assertNoLeak(blob, patterns, label, errors) {
  patterns.forEach(pattern => assert(!pattern.test(blob), `${label} leaked ${pattern}`, errors));
}

(async () => {
  const errors = [];

  const restaurant = await run("I am restaurant owner, customer slipped over water in my restaurant after mopping the floor but should be dried. What should I do? Should I wait for lawyer letter? How much compensation?");
  assert(!!restaurant.pi_workflow?.answer_contract, "restaurant missing answer contract", errors);
  assert(restaurant.pi_workflow?.answer_contract?.scenario_family === "premises_liability", "restaurant wrong scenario family", errors);
  assert((restaurant.pi_workflow?.answer_contract?.forbidden_terms_or_families || []).includes("non-matching injury pathway"), "restaurant contract does not forbid non-matching injury pathway", errors);
  assertNoLeak(auditBlob(restaurant.pi_workflow), [
    /safe plant/,
    /workplace injury/,
    /employees' compensation/,
    /scaffold/,
    /machinery/,
    /forum \/ jurisdiction/,
    /admission - unliquidated/,
    /form 16c/,
  ], "restaurant audit", errors);
  assertNoLeak(workflowBlob(restaurant.pi_workflow), [
    /safe plant/,
    /workplace injury/,
    /employees' compensation/,
    /scaffold/,
    /machinery/,
    /forum \/ jurisdiction/,
    /admission - unliquidated/,
    /form 16c/,
  ], "restaurant workflow", errors);
  assertNoLeak(answerBlob(restaurant), [/score \d/, /safe plant/], "restaurant main answer", errors);

  const workplace = await run("A worker fell from scaffold at a construction site when stacked materials collapsed. What should we do step by step?");
  assert(!!workplace.pi_workflow?.answer_contract, "workplace missing answer contract", errors);
  assert(workplace.pi_workflow?.answer_contract?.scenario_family === "workplace_injury", "workplace wrong scenario family", errors);
  assertNoLeak(auditBlob(workplace.pi_workflow), [
    /restaurant/,
    /wet floor/,
    /mopped/,
    /spillage/,
  ], "workplace audit", errors);
  assertNoLeak(workflowBlob(workplace.pi_workflow), [
    /restaurant/,
    /wet floor/,
    /mopped/,
    /spillage/,
    /customer/,
    /cleaning\/mopping/,
  ], "workplace workflow", errors);
  assert(workflowBlob(workplace.pi_workflow).includes("labour"), "workplace workflow lacks Labour/internal report", errors);
  assert(workflowBlob(workplace.pi_workflow).includes("stacking or storage method"), "workplace workflow lacks stacking/storage evidence", errors);
  assert(workflowBlob(workplace.pi_workflow).includes("employees' compensation"), "workplace workflow lacks EC route", errors);

  const pedestrian = await run("If I am walking out the road with no white lines / zebra crossing and no red or green light, and got crashed by a car, what should I do consecutively?");
  assert(!!pedestrian.pi_workflow?.answer_contract, "pedestrian missing answer contract", errors);
  assert(pedestrian.pi_workflow?.answer_contract?.scenario_family === "road_traffic", "pedestrian wrong scenario family", errors);
  assertNoLeak(auditBlob(pedestrian.pi_workflow), [
    /safe plant/,
    /workplace injury/,
    /employees' compensation/,
    /restaurant/,
    /wet floor/,
    /forum \/ jurisdiction/,
    /admission - unliquidated/,
    /form 16c/,
  ], "pedestrian audit", errors);
  assertNoLeak(workflowBlob(pedestrian.pi_workflow), [
    /restaurant/,
    /wet floor/,
    /mopped/,
    /workplace injury/,
    /safe plant/,
    /employees' compensation/,
    /fatal accident/,
    /psychiatric/,
  ], "pedestrian workflow", errors);
  assert(workflowBlob(pedestrian.pi_workflow).includes("police report"), "pedestrian workflow lacks police report", errors);
  assert(workflowBlob(pedestrian.pi_workflow).includes("driver, vehicle"), "pedestrian workflow lacks driver/vehicle details", errors);
  assert(workflowBlob(pedestrian.pi_workflow).includes("cctv/dashcam"), "pedestrian workflow lacks CCTV/dashcam", errors);

  if (errors.length) {
    console.error("PI answer contract validation failed:");
    errors.forEach(error => console.error(`- ${error}`));
    process.exit(1);
  }

  console.log("PI answer contract validation passed.");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
