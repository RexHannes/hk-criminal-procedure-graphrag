#!/usr/bin/env node
const { demoMatters, loadSyntheticStore, routeForms, writeDemoReport } = require("./forms_cli_common");

const store = loadSyntheticStore();
const result = routeForms({
  store,
  matter: demoMatters().commenced,
  query: "proceedings already commenced do I still need a writ",
  documentIntent: "WRIT",
  workflowStage: "COMMENCEMENT",
});
const report = {
  status: "ok",
  blockedForms: result.blockedForms.map(x => ({
    title: x.template.title,
    documentIntent: x.template.documentIntent,
    reasons: x.blockedBy.map(b => b.reason),
  })),
  alternatives: result.alternativeForms,
};
writeDemoReport("wrong_stage_blocking", report);
console.log(JSON.stringify(report, null, 2));
