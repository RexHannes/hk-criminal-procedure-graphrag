#!/usr/bin/env node
const { applyFormTemplate, demoMatters, loadSyntheticStore, writeDemoReport } = require("./forms_cli_common");

const store = loadSyntheticStore();
const letter = store.templates.find(t => t.documentIntent === "LETTER_OF_CLAIM");
const initialDraft = applyFormTemplate({ store, templateId: letter.id, matter: demoMatters().initial });
const readyDraft = applyFormTemplate({ store, templateId: letter.id, matter: demoMatters().preActionReady });
const report = {
  status: "ok",
  templateId: letter.id,
  initial: {
    finalApprovalBlocked: initialDraft.finalApprovalBlocked,
    missingFactBlockers: initialDraft.missingFactBlockers,
    recommendedEvidenceTasks: initialDraft.recommendedEvidenceTasks,
    blockedClauses: initialDraft.blockedClausesReport.map(x => x.heading),
  },
  preActionReady: {
    finalApprovalBlocked: readyDraft.finalApprovalBlocked,
    missingFactBlockers: readyDraft.missingFactBlockers,
    sectionCount: readyDraft.draftDocument.sections.length,
  },
};
writeDemoReport("draft_from_form_snippets", report);
console.log(JSON.stringify(report, null, 2));
