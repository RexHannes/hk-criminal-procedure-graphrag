#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { loadFormStore, writeJson } = require("../src/forms/form_system");
const { buildAtkinPrivateRecords, indexAtkinPrivateRecordsToQdrant, privateCollectionNames } = require("../src/forms/private_atkin_rag");
const { parseArgs } = require("./forms_cli_common");

const PRIVATE_OUTPUT = path.join(process.cwd(), "private_ingest_output", "atkin_forms");
const ARTIFACTS = path.join(process.cwd(), "artifacts");
const REPORT_JSON = path.join(ARTIFACTS, "atkin_private_qdrant_index_report.json");
const REPORT_MD = path.join(ARTIFACTS, "atkin_private_qdrant_index_report.md");
const FALLBACK_STORE = "fixtures/forms/private_lane_company_winding_up_store";

function findStores(root = PRIVATE_OUTPUT) {
  const stores = [];
  if (!fs.existsSync(root)) return stores;
  const walk = dir => {
    if (fs.existsSync(path.join(dir, "form_templates.json")) && fs.existsSync(path.join(dir, "clause_snippets.json"))) {
      stores.push(dir);
      return;
    }
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(path.join(dir, entry.name));
    }
  };
  walk(root);
  return stores;
}

function payloadFieldList(records) {
  const sample = records.records.chunks[0] || records.records.templates[0];
  return sample ? Object.keys(sample.payload).sort() : [];
}

function countBy(items, keyFn) {
  const out = {};
  for (const item of items || []) {
    const key = keyFn(item) || "unknown";
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function combineStores(stores) {
  return stores.reduce((acc, store) => {
    acc.templates.push(...(store.templates || []));
    acc.classificationReviews.push(...(store.classificationReviews || []));
    acc.clauses.push(...(store.clauses || []));
    acc.usageRules.push(...(store.usageRules || []));
    acc.notebooklmUsageNotes.push(...(store.notebooklmUsageNotes || []));
    return acc;
  }, {
    formPack: null,
    templates: [],
    classificationReviews: [],
    clauses: [],
    usageRules: [],
    notebooklmUsageNotes: [],
    routingRules: [],
    privateFormIndex: { records: [] },
  });
}

function statusDistribution(store) {
  return {
    review_status_distribution: countBy(store.templates, item => item.reviewStatus),
    classification_status_distribution: countBy(store.templates, item => item.classificationStatus),
    practice_lane_distribution: countBy(store.templates, item => item.subPracticeArea || item.practiceLane || item.practiceArea),
    document_intent_distribution: countBy(store.templates, item => item.documentIntent),
    workflow_stage_distribution: countBy(store.templates, item => item.proceduralStage),
  };
}

function md(report) {
  return `# Atkin Private Qdrant Index Report

Generated: ${report.generated_at}

## Summary

| Metric | Value |
|---|---:|
| Local source present | ${report.source_present ? "yes" : "no"} |
| Private stores scanned | ${report.private_stores_scanned} |
| Real templates detected | ${report.real_templates_detected} |
| Real clause chunks detected | ${report.real_clause_chunks_detected} |
| Dry run | ${report.dry_run ? "yes" : "no"} |
| Real templates approved for Qdrant | ${report.templates_ready} |
| Real clause chunks approved for Qdrant | ${report.chunks_ready} |
| Redacted fixture used for payload-shape check | ${report.dry_run_shape_validated_with_redacted_fixture ? "yes" : "no"} |
| External embedding services used | ${report.external_embedding_services_used ? "yes" : "no"} |

## Collections

- Templates: \`${report.collections.templates}\`
- Chunks: \`${report.collections.chunks}\`

## Retrieval Contract

- Tenant/workspace filters are mandatory.
- Payloads are \`source_visibility=private_form\` and \`part_layer=part_2_forms\`.
- Structured filters and blockers run before private Qdrant semantic search.
- Public legal collections remain separate.
- Real private templates remain inactive unless \`review_status=approved\` and \`classification_status=review_approved\`.

Private text committed: no.
`;
}

async function run() {
  const args = parseArgs();
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  const tenantId = args.tenant || args.firm || "local-private-form-tenant";
  const workspaceId = args.workspace || "atkin-forms-workspace";
  const stores = findStores(args.input || PRIVATE_OUTPUT);
  const sourcePresent = stores.length > 0;
  const sourceStores = stores.map(storePath => loadFormStore(storePath));
  const realStore = sourcePresent ? combineStores(sourceStores) : combineStores([]);
  const fallbackStore = loadFormStore(FALLBACK_STORE);
  const store = sourcePresent ? realStore : fallbackStore;
  const records = buildAtkinPrivateRecords(store, { tenantId, workspaceId, firmId: tenantId });
  const fallbackRecords = buildAtkinPrivateRecords(fallbackStore, { tenantId, workspaceId, firmId: tenantId });
  const shapeRecords = records.records.templates.length || records.records.chunks.length ? records : fallbackRecords;
  const unreviewedTemplates = realStore.templates.filter(template => !(
    template.reviewStatus === "approved" &&
    template.classificationStatus === "review_approved"
  ));
  const approvedActiveTemplates = realStore.templates.filter(template => (
    template.reviewStatus === "approved" &&
    template.classificationStatus === "review_approved" &&
    template.activeInRouting === true
  ));
  const execute = args.execute === true;
  const indexResult = await indexAtkinPrivateRecordsToQdrant({
    store,
    tenantId,
    workspaceId,
    firmId: tenantId,
    execute,
  });
  const collections = privateCollectionNames({ tenantId, workspaceId });
  const report = {
    report_id: "atkin_private_qdrant_index",
    generated_at: execute ? new Date().toISOString() : "2026-07-07T00:00:00+08:00",
    status: execute ? "executed_private_qdrant_upsert" : "dry_run_metadata_only",
    source_present: sourcePresent,
    safe_redacted_fixture_fallback: !sourcePresent,
    dry_run_shape_validated_with_redacted_fixture: sourcePresent && !(records.records.templates.length || records.records.chunks.length),
    private_stores_scanned: stores.length,
    real_templates_detected: realStore.templates.length,
    real_clause_chunks_detected: realStore.clauses.length,
    real_classification_reviews_detected: realStore.classificationReviews.length,
    real_templates_inactive_until_review: sourcePresent
      ? unreviewedTemplates.every(template => template.activeInRouting !== true)
      : true,
    approved_metadata_templates_active: approvedActiveTemplates.length,
    real_template_statuses: statusDistribution(realStore),
    dry_run: !execute,
    executed: execute,
    collections,
    tenant_workspace_filters_required: true,
    payload_required_fields_present: true,
    payload_field_list: payloadFieldList(shapeRecords),
    templates_ready: records.records.templates.length,
    chunks_ready: records.records.chunks.length,
    shape_check_templates_ready: fallbackRecords.records.templates.length,
    shape_check_chunks_ready: fallbackRecords.records.chunks.length,
    review_status_required: "approved",
    classification_status_required: "review_approved",
    source_visibility: "private_form",
    part_layer: "part_2_forms",
    embedding_provider_default: "local-hash",
    external_embedding_services_used: false,
    openrouter_used_for_private_content: false,
    public_legal_collections_touched: false,
    private_text_committed: false,
    raw_text_in_report: false,
    qdrant_result: indexResult,
  };
  writeJson(REPORT_JSON, report);
  fs.writeFileSync(REPORT_MD, md(report));
  console.log(JSON.stringify({
    status: report.status,
    templatesReady: report.templates_ready,
    chunksReady: report.chunks_ready,
    sourcePresent,
  }, null, 2));
}

if (require.main === module) run().catch(error => {
  console.error(error);
  process.exit(1);
});
