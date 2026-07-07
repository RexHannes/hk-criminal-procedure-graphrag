#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { ingestPrivateFormPack, writeJson } = require("../src/forms/form_system");
const { parseArgs } = require("./forms_cli_common");

const INPUT_ROOT = path.join(process.cwd(), "private_uploads", "atkin_forms");
const OUTPUT_ROOT = path.join(process.cwd(), "private_ingest_output", "atkin_forms");
const ARTIFACTS = path.join(process.cwd(), "artifacts");
const REPORT_JSON = path.join(ARTIFACTS, "atkin_private_rag_ingestion_report.json");
const REPORT_MD = path.join(ARTIFACTS, "atkin_private_rag_ingestion_report.md");
const INGESTIBLE = new Set([".zip", ".txt", ".md", ".markdown", ".docx", ".doc", ".pdf"]);

function slugify(value) {
  return String(value || "pack").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "pack";
}

function listPacks(root = INPUT_ROOT) {
  if (!fs.existsSync(root)) return [];
  const stat = fs.statSync(root);
  if (stat.isFile()) return INGESTIBLE.has(path.extname(root).toLowerCase()) ? [root] : [];
  return fs.readdirSync(root, { withFileTypes: true })
    .map(entry => path.join(root, entry.name))
    .filter(item => {
      const itemStat = fs.statSync(item);
      return itemStat.isDirectory() || INGESTIBLE.has(path.extname(item).toLowerCase());
    });
}

function countBy(items, keyFn) {
  const out = {};
  for (const item of items || []) {
    const key = keyFn(item) || "unknown";
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function summarize(result, outputDir) {
  const inventory = result.formPack?.fileInventory || [];
  return {
    pack_id: result.formPack?.id || "",
    private_output_dir: path.relative(process.cwd(), outputDir),
    file_count: inventory.length,
    file_type_counts: countBy(inventory, item => item.extension || "directory"),
    templates_detected: result.templates.length,
    clause_chunks_detected: result.clauses.length,
    field_schemas_detected: result.templates.reduce((sum, item) => sum + (item.fieldSchema || []).length, 0),
    classification_reviews_created: (result.classificationReviews || []).length,
    notebooklm_usage_notes_linked: (result.notebooklmUsageNotes || []).length,
    document_intent_distribution: countBy(result.templates, item => item.documentIntent),
    workflow_stage_distribution: countBy(result.templates, item => item.proceduralStage),
    practice_lane_distribution: countBy(result.templates, item => item.subPracticeArea || item.practiceArea),
    inactive_until_review: result.templates.every(item => item.activeInRouting !== true),
    review_status_distribution: countBy(result.templates, item => item.reviewStatus),
    classification_status_distribution: countBy(result.templates, item => item.classificationStatus),
    extraction_warning_count: (result.manifest?.warnings || []).length,
    private_text_committed: false,
  };
}

function md(report) {
  return `# Atkin Private Forms RAG Ingestion Report

Generated: ${report.generated_at}

## Boundary

- Input root: \`private_uploads/atkin_forms/\`
- Output root: \`private_ingest_output/atkin_forms/\`
- Report type: metadata only
- External services used: no
- Private text committed: no
- NotebookLM status: \`INTERNAL_USAGE_NOTE\` only

## Summary

| Metric | Count |
|---|---:|
| Packs discovered | ${report.packs_discovered} |
| Packs processed | ${report.packs_processed} |
| Templates detected | ${report.totals.templates_detected} |
| Clause chunks detected | ${report.totals.clause_chunks_detected} |
| Field schemas detected | ${report.totals.field_schemas_detected} |
| Classification reviews | ${report.totals.classification_reviews_created} |
| NotebookLM notes linked | ${report.totals.notebooklm_usage_notes_linked} |

${report.pack_summaries.length ? report.pack_summaries.map(pack => `### Private Pack

- Output: \`${pack.private_output_dir}\`
- Files: ${pack.file_count}
- Templates: ${pack.templates_detected}
- Clause chunks: ${pack.clause_chunks_detected}
- Inactive until review: ${pack.inactive_until_review ? "yes" : "no"}
- Intent distribution: ${Object.entries(pack.document_intent_distribution).map(([k, v]) => `${k}: ${v}`).join(", ") || "none"}
`).join("\n") : "_No local Atkin source export was found. Export/recover the original source files locally before treating NotebookLM as anything more than a cross-check notebook._"}

## Next Manual Actions

${report.recommended_next_actions.map(item => `- ${item}`).join("\n")}
`;
}

function aggregate(summaries) {
  return summaries.reduce((acc, item) => {
    acc.templates_detected += item.templates_detected;
    acc.clause_chunks_detected += item.clause_chunks_detected;
    acc.field_schemas_detected += item.field_schemas_detected;
    acc.classification_reviews_created += item.classification_reviews_created;
    acc.notebooklm_usage_notes_linked += item.notebooklm_usage_notes_linked;
    acc.extraction_warning_count += item.extraction_warning_count;
    acc.inactive_until_review = acc.inactive_until_review && item.inactive_until_review;
    return acc;
  }, {
    templates_detected: 0,
    clause_chunks_detected: 0,
    field_schemas_detected: 0,
    classification_reviews_created: 0,
    notebooklm_usage_notes_linked: 0,
    extraction_warning_count: 0,
    inactive_until_review: true,
  });
}

function run() {
  const args = parseArgs();
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  const inputRoot = args.input ? path.resolve(args.input) : INPUT_ROOT;
  const outputRoot = args.output ? path.resolve(args.output) : OUTPUT_ROOT;
  fs.mkdirSync(inputRoot, { recursive: true });
  fs.mkdirSync(outputRoot, { recursive: true });
  const packs = listPacks(inputRoot);
  const packSummaries = [];
  const errors = [];
  for (const packPath of packs) {
    const outputDir = path.join(outputRoot, slugify(path.basename(packPath, path.extname(packPath))));
    try {
      const result = ingestPrivateFormPack({
        input: packPath,
        firm: args.firm || "local-private-form-tenant",
        workspace: args.workspace || "atkin-forms-workspace",
        sourcePack: "Private Atkin forms lane",
        licenseNote: "Private forms prototype lane; extracted text stays in gitignored private output.",
        output: outputDir,
        uploadedBy: "local-private-ingest",
        demoMode: false,
      });
      packSummaries.push(summarize(result, outputDir));
    } catch (error) {
      errors.push({
        pack_ref: `private_pack_${packSummaries.length + errors.length + 1}`,
        error_type: error.name || "Error",
        message: String(error.message || error).replace(/\/[^/\s]+/g, "/[redacted]"),
      });
    }
  }
  const report = {
    report_id: "atkin_private_rag_ingestion",
    generated_at: packs.length ? new Date().toISOString() : "2026-07-07T00:00:00+08:00",
    status: packs.length ? (errors.length ? "completed_with_errors" : "completed") : "no_local_source_export_found",
    source_present: packs.length > 0,
    privacy_boundary: {
      input_root: "private_uploads/atkin_forms/",
      output_root: "private_ingest_output/atkin_forms/",
      committed_private_text: false,
      metadata_only_report: true,
      external_services_used: false,
      notebooklm_runtime_engine: false,
      notebooklm_provenance: "INTERNAL_USAGE_NOTE",
    },
    packs_discovered: packs.length,
    packs_processed: packSummaries.length,
    pack_summaries: packSummaries,
    totals: aggregate(packSummaries),
    errors,
    recommended_next_actions: packs.length ? [
      "Open gitignored classification reviews under private_ingest_output/atkin_forms/.",
      "Approve a small lane only after reviewing document intent, stage, role, blockers, and alternatives.",
      "Run the private Qdrant indexer in dry-run mode first.",
      "Enable PRIVATE_QDRANT_FORMS_ENABLED only after tenant/workspace Qdrant credentials are configured.",
    ] : [
      "Recover/export the original private form source files locally under private_uploads/atkin_forms/.",
      "Keep NotebookLM as a cross-check notebook, not as the raw RAG corpus.",
      "Re-run this script locally; extracted output must remain under private_ingest_output/.",
    ],
  };
  writeJson(REPORT_JSON, report);
  fs.writeFileSync(REPORT_MD, md(report));
  console.log(JSON.stringify({
    status: report.status,
    packsProcessed: report.packs_processed,
    reportJson: path.relative(process.cwd(), REPORT_JSON),
  }, null, 2));
}

if (require.main === module) run();
