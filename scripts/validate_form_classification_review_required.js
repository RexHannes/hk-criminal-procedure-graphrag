#!/usr/bin/env node
const fs = require("fs");
const os = require("os");
const path = require("path");
const { assert, ingestPrivateFormPack, loadSyntheticStore, SYNTHETIC_PACK, SYNTHETIC_NOTES, routeForms } = require("./forms_cli_common");
const { loadFormStore } = require("../src/forms/form_system");

const store = loadSyntheticStore();
assert(store.classificationReviews.length === store.templates.length, "Every template must have a classification review record");

for (const template of store.templates) {
  assert(template.reviewStatus === "lawyer_review_required", `${template.id}: template must start lawyer_review_required`);
  assert(template.classificationStatus === "machine_candidate", `${template.id}: classification must start machine_candidate`);
  assert(template.classificationReviewId, `${template.id}: missing classificationReviewId`);
  assert(template.proposedPracticeArea && template.proposedDocumentIntent && template.proposedProceduralStage, `${template.id}: missing proposed classification fields`);
  assert(Array.isArray(template.proposedMatterTypes), `${template.id}: missing proposed matter types`);
  assert(Array.isArray(template.proposedPrerequisites), `${template.id}: missing proposed prerequisites`);
  assert(Array.isArray(template.proposedContraindications), `${template.id}: missing proposed contraindications`);
  assert(template.classificationExtractionTrace?.method, `${template.id}: missing extraction trace`);
  assert(template.reviewerDecision?.status === "pending", `${template.id}: reviewer decision must start pending`);
  assert(template.demoFixture === true && template.routingActiveInDemo === true, `${template.id}: committed fixtures must be explicit synthetic/demo templates`);
}

for (const review of store.classificationReviews) {
  assert(review.classificationStatus === "machine_candidate", `${review.id}: review must be machine_candidate`);
  assert(review.reviewStatus === "lawyer_review_required", `${review.id}: review must require lawyer review`);
  assert(review.reviewerDecision?.status === "pending", `${review.id}: reviewer decision must be pending`);
  assert(review.extractionTrace?.method, `${review.id}: missing extraction trace`);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "forms-real-review-"));
const output = path.join(tmp, "store");
ingestPrivateFormPack({
  input: SYNTHETIC_PACK,
  firm: "real-firm-test",
  workspace: "real-workspace-test",
  sourcePack: "Synthetic files used as private-ingest test",
  licenseNote: "Private pack classification review test; not a demo license.",
  notebooklmNotes: SYNTHETIC_NOTES,
  output,
  uploadedBy: "validator",
  demoMode: false,
});
const realStore = loadFormStore(output);
assert(realStore.templates.every(t => t.demoFixture === false && t.activeInRouting === false), "Real/private machine candidates must not be active in routing by default");
const routed = routeForms({
  store: realStore,
  query: "draft letter of claim for a road traffic personal injury matter",
  matter: { practiceArea: "personal_injury", matterType: "road_traffic_pi", clientRole: "claimant" },
});
assert(routed.recommendedForms.length === 0, "Unreviewed real/private templates must not route by default");
fs.rmSync(tmp, { recursive: true, force: true });

console.log("form classification review required ok");
