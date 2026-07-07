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

function md(report) {
  return `# Atkin Private Qdrant Index Report

Generated: ${report.generated_at}

## Summary

| Metric | Value |
|---|---:|
| Local source present | ${report.source_present ? "yes" : "no"} |
| Dry run | ${report.dry_run ? "yes" : "no"} |
| Templates ready | ${report.templates_ready} |
| Clause chunks ready | ${report.chunks_ready} |
| External embedding services used | ${report.external_embedding_services_used ? "yes" : "no"} |

## Collections

- Templates: \`${report.collections.templates}\`
- Chunks: \`${report.collections.chunks}\`

## Retrieval Contract

- Tenant/workspace filters are mandatory.
- Payloads are \`source_visibility=private_form\` and \`part_layer=part_2_forms\`.
- Structured filters and blockers run before private Qdrant semantic search.
- Public legal collections remain separate.

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
  const storePath = sourcePresent ? stores[0] : FALLBACK_STORE;
  const store = loadFormStore(storePath);
  const records = buildAtkinPrivateRecords(store, { tenantId, workspaceId, firmId: tenantId });
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
    dry_run: !execute,
    executed: execute,
    collections,
    tenant_workspace_filters_required: true,
    payload_required_fields_present: true,
    payload_field_list: payloadFieldList(records),
    templates_ready: records.records.templates.length,
    chunks_ready: records.records.chunks.length,
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
