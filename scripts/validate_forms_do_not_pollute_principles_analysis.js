#!/usr/bin/env node
const fs = require("fs");
const { assert, loadSyntheticStore, routeForms } = require("./forms_cli_common");

const apiSource = fs.readFileSync("api/search-evidence.js", "utf8");
assert(apiSource.includes("shouldAttachPrivateFormsLayer"), "search-evidence API must use a private-forms attachment gate");
assert(/detectsCriminalLawPriority\(q\)\) return false/.test(apiSource), "Criminal priority queries must suppress private forms layer");
assert(/detectsProbateQuery\(q\)\) return false/.test(apiSource), "Probate queries must suppress private forms layer");

const store = loadSyntheticStore();
const criminal = routeForms({ store, query: "What is theft dishonesty and mens rea?" });
assert(criminal.recommendedForms.length === 0, "Criminal theft query must have no private form recommendations");

const probate = routeForms({ store, query: "Explain probate intestacy distribution for children" });
assert(probate.recommendedForms.length === 0, "Probate query must have no private form recommendations");

const tortPrinciple = routeForms({ store, query: "Explain duty of care breach causation and remoteness in tort" });
assert(tortPrinciple.recommendedForms.length === 0, "Tort principle-only query must have no private form recommendations");

const drafting = routeForms({
  store,
  query: "draft letter of claim for road traffic personal injury",
  matter: { practiceArea: "personal_injury", matterType: "road_traffic_pi", clientRole: "claimant", workflowStage: "PRE_ACTION_CORRESPONDENCE" },
  documentIntent: "LETTER_OF_CLAIM",
});
assert(drafting.recommendedForms.length > 0, "Drafting query may include private form recommendations");
assert(apiSource.includes("private_form_recommendations"), "API response must keep private form recommendations in a separate field");
assert(apiSource.includes("source_backed_rules"), "API response must keep public authority analysis separate");

console.log("forms do not pollute principles analysis ok");
