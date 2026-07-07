#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { parseArgs } = require("./forms_cli_common");
const { writeJson } = require("../src/forms/form_system");
const { activatePrivateFormsLane } = require("../src/forms/private_form_activation");

const REPORT_JSON = path.join(process.cwd(), "artifacts", "private_form_review_activation_report.json");
const REPORT_MD = path.join(process.cwd(), "artifacts", "private_form_review_activation_report.md");

function markdown(report) {
  return `# Private Form Review Activation Report

Generated: ${report.generated_at}

Selected lane: \`${report.selected_lane}\`

| Metric | Count |
|---|---:|
| Approved active templates | ${report.approved_count} |
| Inactive templates | ${report.inactive_count} |
| Rejected templates | ${report.rejected_count} |
| Needs review | ${report.needs_review_count} |

Private text committed: no.
`;
}

function run() {
  const args = parseArgs();
  const report = {
    report_id: "private_form_review_activation",
    generated_at: "2026-07-07T00:00:00+08:00",
    ...activatePrivateFormsLane({
      storeDir: args.storeDir || "fixtures/forms/private_lane_company_winding_up_store",
      activationFile: args.activationFile || "private_ingest_output/company_winding_up_review/review_decisions.redacted.json",
      outputDir: args.outputDir || args.storeDir || "fixtures/forms/private_lane_company_winding_up_store",
    }),
  };
  writeJson(REPORT_JSON, report);
  fs.writeFileSync(REPORT_MD, markdown(report));
  console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) run();
