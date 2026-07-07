#!/usr/bin/env node
const fs = require("fs");
const { assert } = require("./forms_cli_common");

const report = JSON.parse(fs.readFileSync("artifacts/atkin_private_qdrant_index_report.json", "utf8"));
assert(report.report_id === "atkin_private_qdrant_index", "Wrong Qdrant index report id");
assert(/^hk_private_form_chunks_[a-z0-9_]+_[a-z0-9_]+$/.test(report.collections?.chunks || ""), "Private chunks collection name is invalid");
assert(/^hk_private_form_templates_[a-z0-9_]+_[a-z0-9_]+$/.test(report.collections?.templates || ""), "Private templates collection name is invalid");
assert(report.tenant_workspace_filters_required === true, "Tenant/workspace filters must be required");
assert(report.source_visibility === "private_form", "Private form source visibility required");
assert(report.part_layer === "part_2_forms", "Private forms must stay in Part 2");
assert(report.embedding_provider_default === "local-hash", "Private Atkin embedding default must be local-hash");
assert(report.external_embedding_services_used === false, "Private Atkin indexing must not use external embedding services by default");
assert(report.openrouter_used_for_private_content === false, "OpenRouter must not be used for private content");
assert(report.public_legal_collections_touched === false, "Private forms must not touch public legal collections");
assert(report.private_text_committed === false && report.raw_text_in_report === false, "Index report must not expose private text");
const required = [
  "tenant_id",
  "workspace_id",
  "source_visibility",
  "part_layer",
  "review_status",
  "classification_status",
  "practice_lane",
  "workflow_stage",
  "document_intent",
  "client_roles",
  "matter_types",
  "missing_fact_blockers",
  "legal_tree_node_ids",
];
for (const key of required) assert((report.payload_field_list || []).includes(key), `Private Qdrant payload missing ${key}`);
console.log("atkin private qdrant index report ok");
