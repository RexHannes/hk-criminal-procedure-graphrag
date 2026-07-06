#!/usr/bin/env node
const { demoMatters, loadSyntheticStore, recommendClauses, writeDemoReport } = require("./forms_cli_common");

const store = loadSyntheticStore();
const matter = {
  ...demoMatters().initial,
  workflowStage: "PRE_ACTION_CORRESPONDENCE",
  opponentIdentified: true,
  liabilityFactsKnown: true,
};
const result = recommendClauses({
  store,
  matter,
  query: "letter of claim but no medical evidence or receipts",
  documentIntent: "LETTER_OF_CLAIM",
});
const report = {
  status: "ok",
  applicableClauseTypes: result.applicableClauses.map(c => c.clauseType),
  blockedClauseTypes: result.blockedClauses.map(c => c.clause.clauseType),
  blockedReasons: result.blockedClauses.flatMap(c => c.reasons),
  provenance: result.provenance,
};
writeDemoReport("clause_usage_rules", report);
console.log(JSON.stringify(report, null, 2));
