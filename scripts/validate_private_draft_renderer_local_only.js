#!/usr/bin/env node
const fs = require("fs");
const { execFileSync } = require("child_process");
const { assert } = require("./forms_cli_common");
const { renderPrivateDraftLocalOnly } = require("../src/forms/private_draft_renderer");

const rendered = renderPrivateDraftLocalOnly({
  storePath: "fixtures/forms/private_lane_company_provisional_liquidator_store",
  matter: {
    companyIdentified: true,
    standingChecked: true,
    urgencyGroundsIdentified: true,
    assetRiskEvidenceAvailable: false,
  },
  outputDir: "private_exports/validator",
});

assert(rendered.outputPath.includes("/private_exports/"), "Draft output must be under private_exports");
assert(fs.existsSync(rendered.outputPath), "Private draft output file missing");
assert(rendered.privateTextCommitted === false, "Private draft renderer must not commit private text");
assert(rendered.finalisationStatus === "blocked", "Missing evidence should block finalisation");
assert(rendered.missingCount >= 1 || rendered.placeholderCount >= 1, "Missing facts/placeholders should be reported");

const trackedPrivateExports = execFileSync("git", ["ls-files", "private_exports"], { encoding: "utf8" }).trim();
assert(!trackedPrivateExports, "private_exports must not be tracked");

const report = JSON.parse(fs.readFileSync("artifacts/private_draft_rendering_report.json", "utf8"));
assert(report.private_text_committed === false, "Draft rendering report must state no private text committed");
assert(report.output_scope === "private_exports_only", "Draft report must state private output scope");

console.log("private draft renderer local-only ok");
