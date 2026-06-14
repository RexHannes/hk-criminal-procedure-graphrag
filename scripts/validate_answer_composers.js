#!/usr/bin/env node
/* Validate the reusable applied-answer composer framework. */

const { composeAnswer, composePiAnswer } = require("../api/answer-composers");

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

function blob(value) {
  return JSON.stringify(value || {}).toLowerCase();
}

const errors = [];

const routes = new Set(["pi", "premises", "principles"]);
const pi = composePiAnswer({
  query: "I am restaurant owner, customer slipped over water in my restaurant after mopping the floor. Should I wait for solicitor letter and how much compensation?",
  routes,
});

assert(pi.classification?.matter_type === "personal_injury", "PI classification missing matter_type", errors);
assert(pi.classification?.scenario === "premises_wet_floor_slip", "PI composer failed wet-floor scenario", errors);
assert(pi.classification?.user_perspective === "defendant_occupier", "PI composer failed defendant/occupier perspective", errors);
assert(pi.applied_answer?.title === "Applied Triage - Restaurant Wet-Floor Slip", "PI composer failed tailored applied answer", errors);
assert(blob(pi.applied_answer).includes("notify your insurer"), "PI tailored answer lacks insurer step", errors);
assert(blob(pi.applied_answer).includes("no sensible compensation estimate"), "PI tailored answer lacks quantum caveat", errors);
assert(pi.source_audit?.display === "collapsed", "PI source audit is not collapsed by default", errors);

const generic = composeAnswer({
  domain: "generic",
  query: "What should I do next?",
  matched: [{ title: "Example graph node" }],
});
assert(generic.applied_answer?.sections?.length >= 2, "Generic composer lacks sections", errors);
assert(generic.source_audit?.display === "collapsed", "Generic source audit is not collapsed", errors);

const criminal = composeAnswer({ domain: "criminal_procedure", query: "What about bail?" });
assert(criminal.classification?.matter_type === "criminal_procedure", "Criminal composer scaffold not routed", errors);
assert(blob(criminal.applied_answer).includes("source verification required"), "Criminal scaffold lacks verification gate", errors);

const company = composeAnswer({ domain: "company_forms", query: "Which form should I use?" });
assert(company.classification?.matter_type === "company_or_civil_forms", "Company/forms composer scaffold not routed", errors);
assert(blob(company.applied_answer).includes("no template means no final draft"), "Company/forms scaffold lacks form gate", errors);

if (errors.length) {
  console.error("Answer composer validation failed:");
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log("Answer composer validation passed.");
