#!/usr/bin/env node
const { assert, demoMatters, loadSyntheticStore, routeForms } = require("./forms_cli_common");

const store = loadSyntheticStore();
const initial = routeForms({ store, matter: demoMatters().initial, query: "what should I do for this road traffic personal injury matter" });
assert(initial.retrievalPolicy.structuredFiltersFirst === true, "Structured filters must run first");
assert(initial.recommendedForms.some(x => x.template.documentIntent === "POLICE_REPORT_REQUEST"), "Police report request should be recommended");
assert(initial.recommendedForms.some(x => x.template.documentIntent === "MEDICAL_RECORDS_REQUEST"), "Medical records request should be recommended");
console.log("form routing engine ok");
