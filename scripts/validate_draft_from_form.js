#!/usr/bin/env node
const { applyFormTemplate, assert, demoMatters, loadSyntheticStore } = require("./forms_cli_common");

const store = loadSyntheticStore();
const letter = store.templates.find(t => t.documentIntent === "LETTER_OF_CLAIM");
const draft = applyFormTemplate({ store, templateId: letter.id, matter: demoMatters().initial });
assert(draft.finalApprovalBlocked === true, "Draft should block final approval when facts/evidence are missing");
assert(draft.missingFactBlockers.length > 0, "Draft should list missing facts");
assert(draft.draftDocument.sections.some(s => s.text.includes("[[")), "Draft should leave placeholders");
console.log("draft from form ok");
