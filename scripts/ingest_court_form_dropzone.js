#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { ingestCourtFormDropzone } = require("../src/forms/court_form_dropzone");
const { parseArgs } = require("./forms_cli_common");
const { writeJson } = require("../src/forms/form_system");

const REPORT_JSON = path.join(process.cwd(), "artifacts", "court_form_dropzone_report.json");
const REPORT_MD = path.join(process.cwd(), "artifacts", "court_form_dropzone_report.md");

function markdown(report) {
  return `# Court Form Dropzone Report

Generated: ${report.generated_at}

## Boundary

- Private court forms are read only from \`${report.input_dir}\`.
- Extracted private text is written only to gitignored \`${report.output_dir}\`.
- This report contains metadata only.
- Private forms are not public legal authority.
- External services used: ${report.external_services_used ? "yes" : "no"}.

## Summary

| Metric | Count |
|---|---:|
| Packs discovered | ${report.packs_discovered} |
| Packs processed | ${report.packs_processed} |
| Templates detected | ${report.totals.templates_detected} |
| Clause-like segments | ${report.totals.clauses_detected} |
| Review queue records | ${report.totals.review_queue_count} |
| Matter document flow records | ${report.totals.matter_document_flow_records} |
| Workflow timeline rules | ${report.totals.workflow_timeline_rules} |
| Extraction warnings | ${report.totals.extraction_warnings} |

## Pack Metadata

${report.pack_reports.map(pack => `- \`${pack.private_store_dir}\`: ${pack.templates_detected} templates, ${pack.clauses_detected} clauses, inactive=${pack.templates_inactive_until_review ? "yes" : "no"}`).join("\n") || "_No court-form packs were found._"}

## Limitations

- Classification is machine-candidate until reviewed.
- Private text remains in gitignored private stores only.
- Review activation and backend recall require configured private store paths.
`;
}

function run() {
  const args = parseArgs();
  const report = {
    report_id: "court_form_dropzone",
    generated_at: "2026-07-07T00:00:00+08:00",
    ...ingestCourtFormDropzone({
      input: args.input || "private_uploads/court_forms",
      firm: args.firm || "demo-firm",
      workspace: args.workspace || "sem2-forms",
      licenseNote: args.licenseNote || "Private court/firm forms; user confirms right to use in private workspace",
      output: args.output || "private_ingest_output/sem2-forms",
      uploadedBy: args.uploadedBy || "local-dropzone",
    }),
  };
  fs.mkdirSync(path.dirname(REPORT_JSON), { recursive: true });
  writeJson(REPORT_JSON, report);
  fs.writeFileSync(REPORT_MD, markdown(report));
  console.log(JSON.stringify({
    status: report.status,
    packsProcessed: report.packs_processed,
    templatesDetected: report.totals.templates_detected,
    reportJson: path.relative(process.cwd(), REPORT_JSON),
  }, null, 2));
}

if (require.main === module) run();
