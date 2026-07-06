#!/usr/bin/env node
const { applyFormTemplate, assert, demoMatters, loadSyntheticStore } = require("./forms_cli_common");

const store = loadSyntheticStore();
const letter = store.templates.find(t => t.documentIntent === "LETTER_OF_CLAIM");
assert(letter, "Expected synthetic letter of claim template");

const draft = applyFormTemplate({ store, templateId: letter.id, matter: demoMatters().initial });
assert(Array.isArray(draft.fieldProvenance) && draft.fieldProvenance.length, "Draft must include field provenance");
assert(Array.isArray(draft.factToFieldTrace), "Draft must include fact-to-field trace");
assert(Array.isArray(draft.placeholderAudit) && draft.placeholderAudit.length, "Draft must include placeholder audit");
assert(Array.isArray(draft.lawyerOnlyFieldBlocks), "Draft must include lawyer-only field gate");
assert(draft.finalApprovalBlocked === true, "Final approval must be blocked when required fields/placeholders remain");
assert(draft.finalApprovalGate?.status === "blocked", "Final approval gate status must be blocked");
assert(draft.finalApprovalGate.requiredFieldsResolvedOrWaived === false, "Required fields must be resolved or waived before final approval");

const complete = applyFormTemplate({ store, templateId: letter.id, matter: demoMatters().preActionReady });
assert(complete.fieldProvenance.every(f => f.source === "matter"), "Complete demo facts should map fields from matter facts");
assert(complete.finalApprovalGate.placeholdersResolved === true, "Complete demo facts should resolve placeholders");

console.log("draft field provenance ok");
