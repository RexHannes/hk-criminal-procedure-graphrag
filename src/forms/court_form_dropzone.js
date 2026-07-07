const fs = require("fs");
const path = require("path");
const {
  ingestPrivateFormPack,
  loadFormStore,
  writeJson,
} = require("./form_system");
const {
  buildMatterDocumentFlowIndex,
  buildWorkflowTimelineRules,
} = require("./form_to_workflow_mapper");
const { summarizeCourtFormClassifications } = require("./court_form_pack_classifier");

const INGESTIBLE_EXTENSIONS = new Set([".zip", ".txt", ".md", ".markdown", ".docx", ".doc", ".pdf"]);

function slugify(value) {
  return String(value || "workspace")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "workspace";
}

function listDropzonePacks(input) {
  const abs = path.resolve(input);
  if (!fs.existsSync(abs)) return [];
  const stat = fs.statSync(abs);
  if (stat.isFile()) return INGESTIBLE_EXTENSIONS.has(path.extname(abs).toLowerCase()) ? [abs] : [];
  return fs.readdirSync(abs, { withFileTypes: true })
    .map(entry => path.join(abs, entry.name))
    .filter(itemPath => {
      const s = fs.statSync(itemPath);
      return s.isDirectory() || (s.isFile() && INGESTIBLE_EXTENSIONS.has(path.extname(itemPath).toLowerCase()));
    });
}

function writeWorkflowIndexes(storeDir) {
  const store = loadFormStore(storeDir);
  const matterDocumentFlowIndex = buildMatterDocumentFlowIndex(store);
  const workflowTimelineRules = buildWorkflowTimelineRules(store);
  writeJson(path.join(storeDir, "matter_document_flow_index.json"), matterDocumentFlowIndex);
  writeJson(path.join(storeDir, "workflow_timeline_rules.json"), workflowTimelineRules);
  return { matterDocumentFlowIndex, workflowTimelineRules };
}

function ingestCourtFormDropzone(options = {}) {
  const {
    input,
    firm,
    workspace,
    licenseNote,
    output,
    uploadedBy = "local-court-form-dropzone",
  } = options;
  if (!input) throw new Error("--input is required");
  if (!firm) throw new Error("--firm is required");
  if (!workspace) throw new Error("--workspace is required");
  if (!licenseNote) throw new Error("--license-note is required");
  if (!output) throw new Error("--output is required");

  fs.mkdirSync(output, { recursive: true });
  const packs = listDropzonePacks(input);
  const packReports = [];
  const errors = [];
  for (const pack of packs) {
    const storeDir = path.join(output, slugify(path.basename(pack, path.extname(pack))));
    try {
      const result = ingestPrivateFormPack({
        input: pack,
        firm,
        workspace,
        sourcePack: "Court form dropzone private pack",
        licenseNote,
        output: storeDir,
        uploadedBy,
        demoMode: false,
      });
      const indexes = writeWorkflowIndexes(storeDir);
      packReports.push({
        private_store_dir: path.relative(process.cwd(), storeDir),
        pack_id: result.formPack.id,
        templates_detected: result.templates.length,
        clauses_detected: result.clauses.length,
        review_queue_count: result.classificationReviews.length,
        extraction_warnings: result.manifest.warnings.length,
        classifications: summarizeCourtFormClassifications(result.templates),
        matter_document_flow_records: indexes.matterDocumentFlowIndex.flows.length,
        workflow_timeline_rules: indexes.workflowTimelineRules.rules.length,
        templates_inactive_until_review: result.templates.every(template => template.activeInRouting !== true),
      });
    } catch (error) {
      errors.push({
        pack_ref: `court_form_pack_${packReports.length + errors.length + 1}`,
        error: error.message,
      });
    }
  }
  return {
    status: errors.length ? "completed_with_errors" : packs.length ? "completed" : "no_court_form_packs_found",
    input_dir: path.relative(process.cwd(), path.resolve(input)),
    output_dir: path.relative(process.cwd(), path.resolve(output)),
    packs_discovered: packs.length,
    packs_processed: packReports.length,
    private_text_committed: false,
    external_services_used: false,
    pack_reports: packReports,
    totals: packReports.reduce((acc, pack) => {
      acc.templates_detected += pack.templates_detected;
      acc.clauses_detected += pack.clauses_detected;
      acc.review_queue_count += pack.review_queue_count;
      acc.extraction_warnings += pack.extraction_warnings;
      acc.matter_document_flow_records += pack.matter_document_flow_records;
      acc.workflow_timeline_rules += pack.workflow_timeline_rules;
      acc.templates_inactive_until_review = acc.templates_inactive_until_review && pack.templates_inactive_until_review;
      return acc;
    }, {
      templates_detected: 0,
      clauses_detected: 0,
      review_queue_count: 0,
      extraction_warnings: 0,
      matter_document_flow_records: 0,
      workflow_timeline_rules: 0,
      templates_inactive_until_review: true,
    }),
    errors,
  };
}

module.exports = {
  ingestCourtFormDropzone,
  listDropzonePacks,
  writeWorkflowIndexes,
};
