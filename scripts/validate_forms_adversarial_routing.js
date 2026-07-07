#!/usr/bin/env node
const { assert, demoMatters, loadSyntheticStore, routeForms, searchForms } = require("./forms_cli_common");

const store = loadSyntheticStore();

function noForms(query, matter = {}, message = query) {
  const routed = routeForms({ store, query, matter });
  assert(routed.recommendedForms.length === 0, `${message}: should not recommend forms`);
  assert(routed.applicableClauses.length === 0, `${message}: should not recommend clauses`);
}

noForms("What is dishonesty for criminal theft?", {}, "criminal-law query");
noForms("How is an intestate estate distributed in probate?", {}, "probate query");
noForms("What are the legal elements of negligence and causation?", {}, "pure legal-principle query");

const commenced = routeForms({
  store,
  query: "draft writ for road traffic personal injury proceedings already commenced",
  matter: { ...demoMatters().commenced, practiceArea: "personal_injury", matterType: "road_traffic_pi", clientRole: "claimant" },
});
assert(commenced.blockedForms.some(item => item.template.documentIntent === "WRIT"), "Writ must be blocked after proceedings commenced");

const opponentUnknown = routeForms({
  store,
  query: "draft letter of claim for road traffic personal injury",
  matter: { ...demoMatters().initial, workflowStage: "PRE_ACTION_CORRESPONDENCE", practiceArea: "personal_injury", matterType: "road_traffic_pi", clientRole: "claimant" },
  documentIntent: "LETTER_OF_CLAIM",
});
assert(opponentUnknown.recommendedForms.some(item => item.caveats.some(c => c.severity === "block_finalisation")), "Letter of claim finalisation must be blocked when opponent unknown");
assert(opponentUnknown.blockedClauses.some(item => item.clause.clauseType === "SPECIAL_DAMAGES"), "Special damages clause must be blocked without receipts/evidence");

const defendant = routeForms({
  store,
  query: "draft claimant letter of claim for defendant-side motor accident matter",
  matter: { practiceArea: "personal_injury", matterType: "road_traffic_pi", clientRole: "defendant", workflowStage: "PRE_ACTION_CORRESPONDENCE" },
  documentIntent: "LETTER_OF_CLAIM",
});
assert(defendant.recommendedForms.length === 0, "Defendant-side matter must not retrieve claimant forms as final recommendations");

const employment = searchForms({
  store,
  query: "draft employment tribunal form for injury at work",
  filters: { practiceArea: "employment", matterType: "employment", documentIntent: "LETTER_OF_CLAIM" },
});
assert(employment.results.length === 0, "Employment form query must not retrieve PI motor-accident templates");

const vectorCannotOverride = searchForms({
  store,
  query: "draft special damages medical accident receipt clause",
  filters: { practiceArea: "probate", matterType: "probate", documentIntent: "LETTER_OF_CLAIM" },
});
assert(vectorCannotOverride.results.length === 0, "Keyword/vector similarity must not override structured filters");

console.log("forms adversarial routing ok");
