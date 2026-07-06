#!/usr/bin/env node
const { assert, demoMatters, loadSyntheticStore, routeForms } = require("./forms_cli_common");

const result = routeForms({ store: loadSyntheticStore(), matter: demoMatters().commenced, query: "proceedings already commenced writ", documentIntent: "WRIT", workflowStage: "COMMENCEMENT" });
assert(result.blockedForms.some(x => x.template.documentIntent === "WRIT"), "Writ must be blocked after proceedings commenced");
assert(result.alternativeForms.some(x => x.documentIntent === "SUMMONS"), "Post-commencement alternatives should be suggested");
console.log("blocked wrong-stage forms ok");
