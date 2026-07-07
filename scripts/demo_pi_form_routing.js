#!/usr/bin/env node
const { demoMatters, loadSyntheticStore, routeForms, writeDemoReport } = require("./forms_cli_common");

const store = loadSyntheticStore();
const matters = demoMatters();
const scenarios = {
  initial: routeForms({ store, matter: matters.initial, query: "what should I do for this road traffic personal injury matter" }),
  preActionReady: routeForms({ store, matter: matters.preActionReady, query: "opponent identified medical record received draft letter of claim" }),
  commenced: routeForms({ store, matter: matters.commenced, query: "proceedings already commenced do I still need a writ" }),
};
const report = {
  status: "ok",
  scenarios: Object.fromEntries(Object.entries(scenarios).map(([key, value]) => [key, {
    recommendedForms: value.recommendedForms.map(x => x.template.documentIntent),
    blockedForms: value.blockedForms.map(x => x.template.documentIntent),
    alternativeForms: value.alternativeForms.map(x => x.documentIntent),
    missingFacts: value.missingFacts,
    requiredEvidence: value.requiredEvidence,
  }])),
};
writeDemoReport("pi_form_routing", report);
console.log(JSON.stringify(report, null, 2));
