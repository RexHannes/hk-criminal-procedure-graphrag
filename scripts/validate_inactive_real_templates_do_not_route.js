#!/usr/bin/env node
const { assert, ingestPrivateFormPack, SYNTHETIC_PACK } = require("./forms_cli_common");
const { loadFormStore, routeForms } = require("../src/forms/form_system");
const fs = require("fs");
const os = require("os");
const path = require("path");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "inactive-real-forms-"));
const output = path.join(tmp, "store");
ingestPrivateFormPack({
  input: SYNTHETIC_PACK,
  firm: "inactive-test-firm",
  workspace: "inactive-test-workspace",
  sourcePack: "Synthetic files used for real/private inactive test",
  licenseNote: "Private-style test; not demo mode.",
  output,
  uploadedBy: "validator",
  demoMode: false,
});
const store = loadFormStore(output);
assert(store.templates.every(template => template.activeInRouting === false), "Real/private templates must be inactive before review");
const routed = routeForms({
  store,
  query: "draft letter of claim for road traffic personal injury",
  matter: { practiceArea: "personal_injury", matterType: "road_traffic_pi", clientRole: "claimant" },
  documentIntent: "LETTER_OF_CLAIM",
});
assert(routed.recommendedForms.length === 0, "Unreviewed real/private templates must not route");
fs.rmSync(tmp, { recursive: true, force: true });
console.log("inactive real templates do not route ok");
