#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { renderPrivateDraftLocalOnly } = require("../src/forms/private_draft_renderer");
const { writeJson } = require("../src/forms/form_system");

const ARTIFACTS = path.join(process.cwd(), "artifacts");

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) continue;
    args[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
  }
  return args;
}

function run() {
  const args = parseArgs(process.argv);
  const storePath = args.store || "fixtures/forms/private_lane_company_provisional_liquidator_store";
  const matter = {
    companyIdentified: true,
    standingChecked: true,
    urgencyGroundsIdentified: true,
    assetRiskEvidenceAvailable: false,
  };
  const rendered = renderPrivateDraftLocalOnly({
    storePath,
    templateId: args.templateId || "",
    matter,
    outputDir: args.output || "private_exports",
  });
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  const report = {
    report_id: "private_draft_rendering",
    generated_at: "2026-07-07T00:00:00+08:00",
    template_id: rendered.templateId,
    document_intent: rendered.documentIntent,
    lane: rendered.lane,
    field_count: rendered.fieldCount,
    filled_count: rendered.filledCount,
    missing_count: rendered.missingCount,
    placeholder_count: rendered.placeholderCount,
    lawyer_only_count: rendered.lawyerOnlyFieldCount,
    finalisation_status: rendered.finalisationStatus,
    output_scope: "private_exports_only",
    private_text_committed: false,
    output_path_committed: false,
  };
  writeJson(path.join(ARTIFACTS, "private_draft_rendering_report.json"), report);
  fs.writeFileSync(path.join(ARTIFACTS, "private_draft_rendering_report.md"), `# Private Draft Rendering Report\n\nGenerated: ${report.generated_at}\n\n| Metric | Count |\n|---|---:|\n| Fields | ${report.field_count} |\n| Filled | ${report.filled_count} |\n| Missing | ${report.missing_count} |\n| Placeholders | ${report.placeholder_count} |\n| Lawyer-only fields | ${report.lawyer_only_count} |\n\nFinalisation status: ${report.finalisation_status}\n\nOutput scope: \`private_exports/\` only.\n\nPrivate text committed: no.\n`);
  console.log(JSON.stringify({
    templateId: report.template_id,
    finalisationStatus: report.finalisation_status,
    privateTextCommitted: false,
  }, null, 2));
}

if (require.main === module) run();
