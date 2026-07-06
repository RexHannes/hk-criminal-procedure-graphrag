#!/usr/bin/env node
const { assert, loadSyntheticStore, recommendClauses, searchForms } = require("./forms_cli_common");

const store = loadSyntheticStore();
const byIntent = searchForms({ store, query: "letter of claim", filters: { practiceArea: "personal_injury", matterType: "road_traffic_pi", documentIntent: "LETTER_OF_CLAIM", workflowStage: "PRE_ACTION_CORRESPONDENCE" } });
const byStage = searchForms({ store, query: "medical evidence", filters: { practiceArea: "personal_injury", matterType: "road_traffic_pi", workflowStage: "MEDICAL_EVIDENCE" } });
const clauses = recommendClauses({
  store,
  matter: {
    practiceArea: "personal_injury",
    matterType: "road_traffic_pi",
    workflowStage: "PRE_ACTION_CORRESPONDENCE",
    opponentIdentified: true,
    liabilityFactsKnown: true,
    medicalEvidenceReceived: false,
    specialDamagesEvidenceAvailable: false,
  },
  query: "special damages receipts",
  documentIntent: "LETTER_OF_CLAIM",
});
assert(byIntent.results.some(t => t.documentIntent === "LETTER_OF_CLAIM"), "Recall by documentIntent failed");
assert(byStage.results.some(t => t.proceduralStage === "MEDICAL_EVIDENCE"), "Recall by workflowStage failed");
assert(clauses.blockedClauses.some(x => x.clause.clauseType === "SPECIAL_DAMAGES"), "Recall by missing fact blocker failed");
assert(store.notebooklmUsageNotes.some(n => (n.relatedClauseIds || []).length), "Recall by NotebookLM note reference failed");
console.log("forms backend recall ok");
