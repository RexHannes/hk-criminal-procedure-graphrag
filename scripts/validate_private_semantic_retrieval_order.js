#!/usr/bin/env node
const fs = require("fs");
const { assert } = require("./forms_cli_common");
const { loadFormStore } = require("../src/forms/form_system");
const { recallPrivateForms } = require("../src/forms/private_form_recall");
const { buildPrivateClauseVectorIndex } = require("../src/forms/private_clause_semantic_retrieval");

const store = loadFormStore("fixtures/forms/private_lane_company_winding_up_store");
const index = buildPrivateClauseVectorIndex(store);

assert(index.privateTextCommitted === false, "Private clause vector index must not commit private text");
assert(index.publicAuthority === false, "Private clause vector index must not be public authority");
assert(index.rawTextStored === false, "Private clause vector index must not store raw text");
assert(index.reviewedOnly === true, "Private clause vector index must contain approved/reviewed chunks only");
assert(index.chunks.length >= 1, "Expected at least one approved private clause chunk");
assert(index.chunks.every(chunk => chunk.reviewStatus === "approved"), "All private semantic chunks must be approved");
assert(index.chunks.every(chunk => chunk.classificationStatus === "review_approved"), "All private semantic chunks must be review-approved");
assert(index.chunks.every(chunk => chunk.storageScope === "private_store_only"), "Chunks must be private-store scoped");
assert(index.chunks.every(chunk => chunk.rawTextStored === false && !Object.prototype.hasOwnProperty.call(chunk, "text")), "Chunks must not expose raw clause text");
assert(index.chunks.every(chunk => Array.isArray(chunk.legalKnowledgeNodeIds) && chunk.legalKnowledgeNodeIds.length > 0), "Chunks must carry ID-only legal tree cross-links");

const baseMatter = {
  firmId: "private-lane-pilot-firm",
  workspaceId: "company-winding-up-pilot",
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

const positive = recallPrivateForms({
  store,
  matter: baseMatter,
  query: "draft company winding-up petition evidence gate",
  documentIntent: "COMPANY_WINDING_UP_PETITION",
  workflowStage: "COMPANY_WINDING_UP",
});

const retrieval = positive.semanticClauseRetrieval;
assert(retrieval.structuredFiltersFirst === true, "Semantic retrieval must declare structured filters first");
assert(retrieval.semanticAfterStructuredFilters === true, "Semantic retrieval must happen only after filters");
assert(retrieval.semanticExecuted === true, "Positive approved lane should execute semantic retrieval");
assert(retrieval.indexStats.returnedChunks >= 1, "Positive approved lane should return a private clause chunk");
assert(retrieval.chunks.every(chunk => chunk.privateTextCommitted === false), "Returned chunks must not commit private text");
assert(retrieval.chunks.every(chunk => chunk.publicAuthority === false), "Returned chunks must not be public authority");

const expectedOrder = [
  "practice_lane_filter",
  "workflow_stage_filter",
  "document_intent_filter",
  "client_role_matter_type_filter",
  "missing_fact_blocker_filter",
  "semantic_vector_retrieval",
];
assert(JSON.stringify(retrieval.retrievalOrder) === JSON.stringify(expectedOrder), "Retrieval order changed");

const report = JSON.parse(fs.readFileSync("artifacts/private_form_semantic_retrieval_report.json", "utf8"));
assert(report.part_1_public_legal_authority_unchanged === true, "Part 1 must remain public authority analysis");
assert(report.part_2_private_form_retrieval_enabled === true, "Part 2 must use private form retrieval");
assert(report.part_3_uses_document_flow_timeline_rules === true, "Part 3 must use timeline/document-flow rules");
assert(report.notebooklm_runtime_engine === false, "NotebookLM must not be the runtime engine");
assert(report.cross_links_to_legal_tree_are_id_only === true, "Legal-tree cross-links must be ID-only");

console.log("private semantic retrieval order ok");
