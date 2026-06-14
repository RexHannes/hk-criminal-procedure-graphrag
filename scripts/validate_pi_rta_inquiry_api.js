#!/usr/bin/env node
/* Regression test for layperson pedestrian/RTA queries entering PI applied workflow. */

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

function sectionHeadings(answer) {
  return (answer?.sections || []).map(section => section.heading);
}

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

(async () => {
  const errors = [];
  const payload = await run("If I am walking out the road with no white lines / zebra crossing and no red or green light, and got crashed by a car, what should I do consecutively?");
  const workflow = payload.pi_workflow;
  const triage = workflow?.applied_triage || workflow?.applied_answer;
  const headings = sectionHeadings(triage);

  assert(!!workflow, "missing pi_workflow", errors);
  assert(payload.analysis_status === "skipped_pi_workflow", "PI workflow should avoid OpenRouter analysis-first path", errors);
  assert(workflow?.classification?.scenario === "pedestrian_road_traffic_collision_uncontrolled_crossing", "wrong pedestrian/RTA scenario", errors);
  assert(workflow?.classification?.user_perspective === "claimant_pedestrian", "wrong pedestrian claimant perspective", errors);
  assert(workflow?.classification?.procedural_posture === "post_accident_early_triage", "wrong step-by-step posture", errors);
  assert(triage?.title?.includes("Pedestrian Road Traffic Accident"), "missing pedestrian RTA applied title", errors);
  [
    "Immediate Steps",
    "Liability / Driver Duty",
    "Pedestrian Conduct / Contributory Negligence",
    "Evidence To Preserve",
    "Medical Evidence / Quantum",
  ].forEach(heading => assert(headings.includes(heading), `missing section: ${heading}`, errors));
  assert(blob(triage).includes("absence of zebra lines or traffic lights does not automatically defeat a claim"), "missing no-zebra/no-light caveat", errors);
  assert(blob(triage).includes("police"), "missing police report guidance", errors);
  assert(blob(triage).includes("no sensible compensation estimate"), "missing quantum caveat", errors);
  assert((workflow?.answer_contract?.forbidden_terms_or_families || []).includes("non-matching premises pathway"), "premises pathway should be excluded", errors);
  assert((workflow?.answer_contract?.forbidden_terms_or_families || []).includes("non-matching injury pathway"), "injury pathway should be excluded", errors);
  assert((workflow?.answer_contract?.forbidden_terms_or_families || []).includes("non-matching dependency pathway"), "dependency pathway should be excluded", errors);
  assert((workflow?.answer_contract?.forbidden_terms_or_families || []).includes("non-matching mental harm pathway"), "mental harm pathway should be excluded", errors);

  if (errors.length) {
    console.error("PI RTA inquiry validation failed:");
    errors.forEach(error => console.error(`- ${error}`));
    process.exit(1);
  }

  console.log("PI RTA inquiry validation passed: pedestrian uncontrolled crossing applied triage.");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
