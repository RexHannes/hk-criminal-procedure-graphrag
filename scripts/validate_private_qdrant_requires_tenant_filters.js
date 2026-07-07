#!/usr/bin/env node
const { assert } = require("./forms_cli_common");
const { loadFormStore, routeForms } = require("../src/forms/form_system");
const { buildPrivateQdrantRecallFilter, buildAtkinPrivateRecords, privateCollectionNames } = require("../src/forms/private_atkin_rag");

const tenantId = "private-lane-pilot-firm";
const workspaceId = "company-winding-up-pilot";
const store = loadFormStore("fixtures/forms/private_lane_company_winding_up_store");
const matter = {
  firmId: tenantId,
  workspaceId,
  practiceArea: "company_corporate",
  practiceLane: "company_winding_up",
  matterType: "company_winding_up",
  workflowStage: "COMPANY_WINDING_UP",
  clientRole: "creditor",
  companyIdentified: true,
  debtOrGroundIdentified: true,
  standingChecked: true,
  statutoryDemandOrServiceEvidenceAvailable: true,
};
const routing = routeForms({
  store,
  matter,
  query: "draft company winding-up petition",
  documentIntent: "COMPANY_WINDING_UP_PETITION",
  workflowStage: "COMPANY_WINDING_UP",
});
const filter = buildPrivateQdrantRecallFilter({
  matter,
  routing,
  tenantId,
  workspaceId,
  firmId: tenantId,
  documentIntent: "COMPANY_WINDING_UP_PETITION",
  workflowStage: "COMPANY_WINDING_UP",
});
const keys = filter.must.map(item => item.key);
for (const key of ["tenant_id", "workspace_id", "source_visibility", "part_layer", "review_status", "classification_status", "practice_lane", "workflow_stage", "document_intent", "client_roles", "matter_types", "template_id"]) {
  assert(keys.includes(key), `Private Qdrant filter missing ${key}`);
}
const collections = privateCollectionNames({ tenantId, workspaceId });
assert(collections.chunks.includes("private_form_chunks"), "Chunks collection must be private-form scoped");
const records = buildAtkinPrivateRecords(store, { tenantId, workspaceId, firmId: tenantId });
for (const record of [...records.records.templates, ...records.records.chunks]) {
  assert(record.payload.tenant_id === tenantId, "Payload tenant_id mismatch");
  assert(record.payload.workspace_id === workspaceId, "Payload workspace_id mismatch");
  assert(record.payload.source_visibility === "private_form", "Payload source_visibility mismatch");
  assert(record.payload.part_layer === "part_2_forms", "Payload part_layer mismatch");
}
console.log("private qdrant tenant/workspace filters ok");
