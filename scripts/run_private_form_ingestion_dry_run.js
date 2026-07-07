#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const {
  ensureArtifactsDir,
  ingestPrivateFormPack,
  parseArgs,
} = require("./forms_cli_common");
const { writeJson } = require("../src/forms/form_system");

const PRIVATE_UPLOADS = path.join(process.cwd(), "private_uploads");
const PRIVATE_NOTES = path.join(process.cwd(), "private_notebooklm_notes");
const PRIVATE_OUTPUT = path.join(process.cwd(), "private_ingest_output");
const REPORT_JSON = path.join(process.cwd(), "artifacts", "private_form_ingestion_dry_run_report.json");
const REPORT_MD = path.join(process.cwd(), "artifacts", "private_form_ingestion_dry_run_report.md");

const INGESTIBLE_EXTENSIONS = new Set([".zip", ".txt", ".md", ".markdown", ".docx", ".doc", ".pdf"]);

function slugify(value) {
  return String(value || "pack")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "pack";
}

function listCandidatePacks(root = PRIVATE_UPLOADS) {
  if (!fs.existsSync(root)) return [];
  const stat = fs.statSync(root);
  if (stat.isFile()) {
    return INGESTIBLE_EXTENSIONS.has(path.extname(root).toLowerCase()) ? [root] : [];
  }
  const entries = fs.readdirSync(root, { withFileTypes: true });
  return entries
    .map(entry => path.join(root, entry.name))
    .filter(itemPath => {
      try {
        const stat = fs.statSync(itemPath);
        return stat.isDirectory() || (stat.isFile() && INGESTIBLE_EXTENSIONS.has(path.extname(itemPath).toLowerCase()));
      } catch (error) {
        return false;
      }
    });
}

function findNotesForPack(packPath) {
  if (!fs.existsSync(PRIVATE_NOTES)) return "";
  const base = slugify(path.basename(packPath, path.extname(packPath)));
  const candidates = [
    `${base}.md`,
    `${base}.markdown`,
    `${base}.txt`,
    "notes.md",
    "notebooklm_notes.md",
  ].map(name => path.join(PRIVATE_NOTES, name));
  return candidates.find(file => fs.existsSync(file)) || "";
}

function countBy(items, keyFn) {
  const out = {};
  for (const item of items || []) {
    const key = keyFn(item) || "unknown";
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function sanitizeWarnings(warnings) {
  return Array.from(new Set((warnings || []).map(item => String(item || "").replace(/\/[^/\s]+/g, "/[redacted]"))));
}

function summarizeStore(result, outputDir, includeSafeTitles = false) {
  const inventory = result.formPack?.fileInventory || [];
  const reviews = result.classificationReviews || [];
  const extractionWarnings = result.manifest?.warnings || [];
  return {
    pack_id: result.formPack?.id || "",
    private_output_dir: path.relative(process.cwd(), outputDir),
    file_count: inventory.length,
    file_type_counts: countBy(inventory, item => item.extension || "directory"),
    supported_file_count: inventory.filter(item => item.supported).length,
    rejected_or_suspicious_file_count: inventory.filter(item => item.rejected || (item.warnings || []).length).length,
    templates_detected: result.templates.length,
    clauses_detected: result.clauses.length,
    notebooklm_notes_linked: result.notebooklmUsageNotes.length,
    classification_reviews_created: reviews.length,
    document_intent_distribution: countBy(result.templates, item => item.documentIntent),
    stage_distribution: countBy(result.templates, item => item.proceduralStage),
    practice_area_distribution: countBy(result.templates, item => item.practiceArea),
    review_status_distribution: countBy(result.templates, item => item.reviewStatus),
    classification_status_distribution: countBy(result.templates, item => item.classificationStatus),
    templates_inactive_until_review: result.templates.every(item => item.activeInRouting !== true),
    percentage_requiring_manual_classification: result.templates.length
      ? Number((100 * result.templates.filter(item => item.classificationStatus === "machine_candidate").length / result.templates.length).toFixed(2))
      : 0,
    extraction_warning_count: extractionWarnings.length,
    extraction_warnings: sanitizeWarnings(extractionWarnings),
    candidate_template_titles: includeSafeTitles ? result.templates.map(item => item.title).slice(0, 50) : [],
    titles_redacted_by_default: !includeSafeTitles,
  };
}

function markdownReport(report) {
  const rows = [
    ["Packs processed", report.packs_processed],
    ["Templates detected", report.totals.templates_detected],
    ["Clauses detected", report.totals.clauses_detected],
    ["NotebookLM notes linked", report.totals.notebooklm_notes_linked],
    ["Classification reviews created", report.totals.classification_reviews_created],
    ["Templates inactive until review", report.totals.templates_inactive_until_review ? "yes" : "no"],
    ["Manual classification required", `${report.totals.percentage_requiring_manual_classification}%`],
    ["Extraction warnings", report.totals.extraction_warning_count],
    ["Rejected/suspicious files", report.totals.rejected_or_suspicious_file_count],
  ];
  return `# Private Form Ingestion Dry Run Report

Generated: ${report.generated_at}

## Privacy Boundary

- Private ZIPs/forms are read only from \`private_uploads/\`.
- Extracted private text is written only to gitignored \`private_ingest_output/\`.
- NotebookLM/internal notes are read only from gitignored \`private_notebooklm_notes/\`.
- This committed report contains metadata only: counts, distributions, warnings, and review-gate state.
- Candidate titles are redacted by default unless \`--include-safe-titles\` is used locally.
- No private content is sent to external services.

## Summary

| Metric | Value |
|---|---:|
${rows.map(([k, v]) => `| ${k} | ${v} |`).join("\n")}

## Pack Results

${report.pack_summaries.length ? report.pack_summaries.map(pack => `### ${pack.pack_id || "private pack"}

- Private output: \`${pack.private_output_dir}\`
- Files: ${pack.file_count}
- File types: ${Object.entries(pack.file_type_counts).map(([k, v]) => `${k}: ${v}`).join(", ") || "none"}
- Templates: ${pack.templates_detected}
- Clauses: ${pack.clauses_detected}
- Notes linked: ${pack.notebooklm_notes_linked}
- Review queue: ${pack.classification_reviews_created}
- Intent distribution: ${Object.entries(pack.document_intent_distribution).map(([k, v]) => `${k}: ${v}`).join(", ") || "none"}
- Stage distribution: ${Object.entries(pack.stage_distribution).map(([k, v]) => `${k}: ${v}`).join(", ") || "none"}
- Extraction warnings: ${pack.extraction_warning_count}
- Templates inactive until review: ${pack.templates_inactive_until_review ? "yes" : "no"}
`).join("\n") : "_No private packs were found in `private_uploads/` during this run._"}

## Recommended Manual Review Actions

${report.recommended_manual_review_actions.map(item => `- ${item}`).join("\n")}

## Remaining Limitations

- DOC/PDF extraction quality depends on local command-line tools and source formatting.
- Regex/keyword classifications are not lawyer-approved.
- Real/private templates must remain inactive until classification review is completed.
- Production private store mapping and reviewer permissions are not configured by this dry run.
`;
}

function emptyTotals() {
  return {
    templates_detected: 0,
    clauses_detected: 0,
    notebooklm_notes_linked: 0,
    classification_reviews_created: 0,
    templates_inactive_until_review: true,
    percentage_requiring_manual_classification: 0,
    extraction_warning_count: 0,
    rejected_or_suspicious_file_count: 0,
  };
}

function aggregate(packSummaries) {
  const totals = emptyTotals();
  for (const pack of packSummaries) {
    totals.templates_detected += pack.templates_detected;
    totals.clauses_detected += pack.clauses_detected;
    totals.notebooklm_notes_linked += pack.notebooklm_notes_linked;
    totals.classification_reviews_created += pack.classification_reviews_created;
    totals.extraction_warning_count += pack.extraction_warning_count;
    totals.rejected_or_suspicious_file_count += pack.rejected_or_suspicious_file_count;
    totals.templates_inactive_until_review = totals.templates_inactive_until_review && pack.templates_inactive_until_review;
  }
  totals.percentage_requiring_manual_classification = totals.templates_detected
    ? Number((100 * packSummaries.reduce((sum, pack) => {
      return sum + Math.round(pack.templates_detected * pack.percentage_requiring_manual_classification / 100);
    }, 0) / totals.templates_detected).toFixed(2))
    : 0;
  return totals;
}

function loadPreservableExistingReport() {
  if (!fs.existsSync(REPORT_JSON)) return null;
  try {
    const existing = JSON.parse(fs.readFileSync(REPORT_JSON, "utf8"));
    const safe = existing.privacy_boundary?.metadata_only_report === true
      && existing.privacy_boundary?.committed_private_text === false
      && existing.privacy_boundary?.external_services_used === false;
    const hasLocalDryRunMetadata = ["completed", "completed_with_errors"].includes(existing.status)
      && Number(existing.packs_processed || 0) > 0;
    return safe && hasLocalDryRunMetadata ? existing : null;
  } catch (error) {
    return null;
  }
}

function run() {
  const args = parseArgs();
  ensureArtifactsDir();
  fs.mkdirSync(PRIVATE_UPLOADS, { recursive: true });
  fs.mkdirSync(PRIVATE_NOTES, { recursive: true });
  fs.mkdirSync(PRIVATE_OUTPUT, { recursive: true });

  const packs = listCandidatePacks(args.input || PRIVATE_UPLOADS);
  const preserved = packs.length || args.forceEmptyReport ? null : loadPreservableExistingReport();
  if (preserved) {
    console.log(JSON.stringify({
      status: "preserved_existing_metadata_report",
      packsDiscovered: 0,
      packsProcessed: preserved.packs_processed,
      reportJson: path.relative(process.cwd(), REPORT_JSON),
      reportMd: path.relative(process.cwd(), REPORT_MD),
    }, null, 2));
    return;
  }

  const packSummaries = [];
  const errors = [];
  for (const packPath of packs) {
    const outputDir = path.join(PRIVATE_OUTPUT, slugify(path.basename(packPath, path.extname(packPath))));
    try {
      const notesPath = findNotesForPack(packPath);
      const result = ingestPrivateFormPack({
        input: packPath,
        firm: args.firm || "local-private-dry-run-firm",
        workspace: args.workspace || "local-private-dry-run-workspace",
        sourcePack: "Private local dry-run pack",
        licenseNote: "Private local dry run only; generated output is gitignored and not committed.",
        notebooklmNotes: notesPath || undefined,
        output: outputDir,
        uploadedBy: "local-dry-run",
        demoMode: false,
      });
      packSummaries.push(summarizeStore(result, outputDir, args.includeSafeTitles === true));
    } catch (error) {
      errors.push({
        pack_ref: `private_pack_${packSummaries.length + errors.length + 1}`,
        error_type: error.name || "Error",
        message: String(error.message || error).replace(/\/[^/\s]+/g, "/[redacted]"),
      });
    }
  }

  const totals = aggregate(packSummaries);
  const report = {
    report_id: "private_form_ingestion_dry_run",
    generated_at: packs.length ? new Date().toISOString() : "2026-07-06T00:00:00.000Z",
    status: packs.length ? (errors.length ? "completed_with_errors" : "completed") : "no_private_uploads_found",
    privacy_boundary: {
      private_uploads_dir: "private_uploads/",
      private_notebooklm_notes_dir: "private_notebooklm_notes/",
      private_output_dir: "private_ingest_output/",
      committed_private_text: false,
      external_services_used: false,
      metadata_only_report: true,
      candidate_titles_redacted_by_default: args.includeSafeTitles !== true,
    },
    packs_discovered: packs.length,
    packs_processed: packSummaries.length,
    pack_summaries: packSummaries,
    totals,
    errors,
    recommended_manual_review_actions: packs.length ? [
      "Open the gitignored classification review JSON under private_ingest_output/.",
      "Review practice area, document intent, procedural stage, prerequisites, and contraindications.",
      "Approve only one small practice-lane subset first, such as PI, company winding-up, contracts, or probate.",
      "Keep rejected and uncertain templates inactive in routing.",
      "Re-run adversarial routing tests after any approval.",
    ] : [
      "Place private ZIPs/forms under private_uploads/ and optional NotebookLM notes under private_notebooklm_notes/.",
      "Run node scripts/run_private_form_ingestion_dry_run.js locally.",
      "Inspect gitignored private_ingest_output/ before approving any template.",
    ],
  };

  writeJson(REPORT_JSON, report);
  fs.writeFileSync(REPORT_MD, markdownReport(report));
  console.log(JSON.stringify({
    status: report.status,
    packsDiscovered: report.packs_discovered,
    packsProcessed: report.packs_processed,
    reportJson: path.relative(process.cwd(), REPORT_JSON),
    reportMd: path.relative(process.cwd(), REPORT_MD),
  }, null, 2));
}

if (require.main === module) run();

module.exports = {
  aggregate,
  listCandidatePacks,
  summarizeStore,
};
