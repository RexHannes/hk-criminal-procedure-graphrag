#!/usr/bin/env node
/* Validate the reusable applied-answer composer framework. */

const { composeAnswer, composePiAnswer } = require("../src/api/answer-composers");

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

const mallSlip = composePiAnswer({
  query: "My client slipped in a mall common area and fractured her wrist. What should we do?",
  routes: new Set(["pi", "premises", "principles"]),
});
assert(mallSlip.classification?.scenario === "premises_wet_floor_slip" || mallSlip.classification?.scenario === "premises_slip_trip", "PI composer failed mall/premises slip scenario", errors);
assert(blob(mallSlip.applied_answer).includes("cctv"), "Mall slip answer lacks CCTV preservation", errors);

const workplace = composePiAnswer({
  query: "A worker fell from scaffold at a construction site and was injured at work.",
  routes: new Set(["pi", "workplace", "principles"]),
});
assert(workplace.classification?.scenario === "workplace_fall_or_site_injury", "PI composer failed workplace scaffold scenario", errors);
assert(blob(workplace.applied_answer).includes("employees' compensation"), "Workplace answer lacks EC overlay", errors);

const roadTraffic = composePiAnswer({
  query: "Passenger injured in a taxi road traffic collision. What forms and evidence are needed?",
  routes: new Set(["pi", "traffic", "forms", "principles"]),
});
assert(roadTraffic.classification?.scenario === "road_traffic_passenger_or_road_user", "PI composer failed road traffic scenario", errors);
assert(blob(roadTraffic.applied_answer).includes("passenger"), "RTA answer lacks passenger analysis", errors);

const fatal = composePiAnswer({
  query: "Fatal accident dependency claim for deceased worker. What should the family collect?",
  routes: new Set(["pi", "workplace", "principles"]),
});
assert(fatal.classification?.scenario === "fatal_accident_dependency", "PI composer failed fatal accident scenario", errors);
assert(blob(fatal.applied_answer).includes("dependency"), "Fatal answer lacks dependency evidence", errors);

const generic = composeAnswer({
  domain: "generic",
  query: "What should I do next?",
  matched: [{ title: "Example graph node" }],
});
assert(generic.applied_answer?.sections?.length >= 8, "Generic composer lacks professional section set", errors);
assert(generic.classification?.answer_mode === "professional_source_gated", "Generic composer lacks professional mode", errors);
assert(generic.answer_contract?.verification_rule?.includes("No paragraph citation"), "Generic composer lacks verification rule", errors);
assert(generic.source_audit?.display === "collapsed", "Generic source audit is not collapsed", errors);

const inconsistent = composeAnswer({
  domain: "generic",
  query: "What is the consequence for adducing inconsistent factual pleadings for the same plaintiff across more than one case? Please explain abuse of process, estoppel and collateral attack.",
  matched: [],
});
assert(inconsistent.classification?.matter_type === "general_legal_research", "Inconsistent pleadings composer should be general legal research", errors);
assert(inconsistent.classification?.scenario === "inconsistent_positions_across_proceedings", "Generic professional composer failed inconsistent pleadings scenario", errors);
assert(inconsistent.classification?.answer_mode === "professional_source_gated", "Professional answer mode missing", errors);
assert((inconsistent.applied_answer?.sections || []).length >= 7, "Professional answer lacks full section set", errors);
assert(inconsistent.answer_contract?.domain === "general_legal_research", "Professional answer contract should be general", errors);
assert(blob(inconsistent.applied_answer).includes("abuse of process"), "Professional answer lacks abuse of process", errors);
assert(blob(inconsistent.applied_answer).includes("estoppel"), "Professional answer lacks estoppel", errors);
assert(blob(inconsistent.applied_answer).includes("collateral attack"), "Professional answer lacks collateral attack", errors);
assert(blob(inconsistent.applied_answer).includes("pleading inconsistency matrix"), "Professional answer lacks document workflow", errors);
assert(blob(inconsistent.applied_answer).includes("not automatically more accurate"), "Professional answer lacks accuracy caveat", errors);
assert(inconsistent.source_audit?.verification_status === "candidate_authorities_require_paragraph_check", "Professional source audit should require paragraph check", errors);

const criminal = composeAnswer({ domain: "criminal_procedure", query: "My client was arrested and asks about bail." });
assert(criminal.classification?.matter_type === "criminal_procedure", "Criminal composer scaffold not routed", errors);
assert(criminal.classification?.scenario === "bail_or_release", "Criminal composer failed bail scenario", errors);
assert(blob(criminal.applied_answer).includes("release"), "Criminal bail answer lacks release triage", errors);

const company = composeAnswer({ domain: "company_forms", query: "We need a winding-up demand and petition route. Which form should I use?" });
assert(company.classification?.matter_type === "company_or_civil_forms", "Company/forms composer scaffold not routed", errors);
assert(company.classification?.scenario === "winding_up_or_statutory_demand", "Company/forms composer failed winding-up scenario", errors);
assert(blob(company.applied_answer).includes("do not draft or file from memory"), "Company/forms answer lacks drafting gate", errors);

if (errors.length) {
  console.error("Answer composer validation failed:");
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log("Answer composer validation passed.");
