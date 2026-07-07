const crypto = require("crypto");
const { localHashEmbedding, qdrantRequest, loadEnv } = require("../legal_answer/qdrant_retriever");
const { routeForms, inferMatterFromQuery } = require("./form_system");
const { buildPrivateClauseVectorIndex } = require("./private_clause_semantic_retrieval");

const DEFAULT_DIMENSION = 384;

function slugForQdrant(value) {
  return String(value || "default")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48) || "default";
}

function privateCollectionNames({ tenantId = "local_private", workspaceId = "default" } = {}) {
  const tenant = slugForQdrant(tenantId);
  const workspace = slugForQdrant(workspaceId);
  return {
    chunks: `hk_private_form_chunks_${tenant}_${workspace}`,
    templates: `hk_private_form_templates_${tenant}_${workspace}`,
  };
}

function pointId(value) {
  const hex = crypto.createHash("sha256").update(String(value)).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function cleanArray(value) {
  return Array.from(new Set((Array.isArray(value) ? value : [value]).filter(Boolean).map(item => String(item))));
}

function approvedTemplates(store) {
  return (store.templates || []).filter(template => (
    template.reviewStatus === "approved" &&
    template.classificationStatus === "review_approved"
  ));
}

function approvedTemplateMap(store) {
  return new Map(approvedTemplates(store).map(template => [template.id, template]));
}

function embeddingSourceForTemplate(template) {
  return [
    template.practiceArea,
    template.subPracticeArea,
    template.documentIntent,
    template.proceduralStage,
    ...(template.applicableMatterTypes || []),
    ...(template.applicableRoles || []),
    ...(template.prerequisites || []),
    ...(template.contraindications || []),
    ...(template.recommendedWhen || []),
    ...(template.legalKnowledgeNodeIds || []),
  ].join(" ");
}

function embeddingSourceForChunk(chunk) {
  return [
    chunk.practiceArea,
    chunk.practiceLane,
    chunk.documentIntent,
    chunk.workflowStage,
    chunk.clauseType,
    ...(chunk.issueTags || []),
    ...(chunk.factRequirements || []),
    ...(chunk.clientRoles || []),
    ...(chunk.matterTypes || []),
    ...(chunk.legalKnowledgeNodeIds || []),
  ].join(" ");
}

function basePayload({ tenantId, workspaceId, firmId }) {
  return {
    tenant_id: tenantId || firmId || "local_private",
    firm_id: firmId || tenantId || "local_private",
    workspace_id: workspaceId || "default",
    source_visibility: "private_form",
    part_layer: "part_2_forms",
    public_authority: false,
    private_text_committed: false,
    notebooklm_runtime_engine: false,
    notebooklm_provenance: "INTERNAL_USAGE_NOTE",
    embedding_provider: "local-hash",
    external_embedding_services_used: false,
  };
}

function templatePayload(template, scope) {
  return {
    ...basePayload({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId || template.workspaceId,
      firmId: scope.firmId || template.firmId,
    }),
    source_kind: "private_form_template",
    template_id: template.id,
    review_status: template.reviewStatus,
    classification_status: template.classificationStatus,
    practice_area: template.practiceArea || "",
    practice_lane: template.subPracticeArea || template.practiceLane || template.practiceArea || "",
    workflow_stage: template.proceduralStage || "",
    document_intent: template.documentIntent || "",
    client_role: (template.applicableRoles || [])[0] || "",
    client_roles: cleanArray(template.applicableRoles || []),
    matter_type: (template.applicableMatterTypes || [])[0] || "",
    matter_types: cleanArray(template.applicableMatterTypes || []),
    blockers: cleanArray([...(template.blockedWhen || []), ...(template.contraindications || [])]),
    missing_fact_blockers: cleanArray(template.prerequisites || []),
    legal_tree_node_ids: cleanArray(template.legalKnowledgeNodeIds || []),
    answer_layer: "private_forms_only",
  };
}

function chunkPayload(chunk, scope) {
  return {
    ...basePayload({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId || chunk.workspaceId,
      firmId: scope.firmId || chunk.firmId,
    }),
    source_kind: "private_form_clause_chunk",
    chunk_id: chunk.chunkId,
    clause_id: chunk.clauseId,
    template_id: chunk.templateId,
    review_status: chunk.reviewStatus,
    classification_status: chunk.classificationStatus,
    practice_area: chunk.practiceArea || "",
    practice_lane: chunk.practiceLane || chunk.practiceArea || "",
    workflow_stage: chunk.workflowStage || "",
    document_intent: chunk.documentIntent || "",
    client_role: (chunk.clientRoles || [])[0] || "",
    client_roles: cleanArray(chunk.clientRoles || []),
    matter_type: (chunk.matterTypes || [])[0] || "",
    matter_types: cleanArray(chunk.matterTypes || []),
    clause_type: chunk.clauseType || "",
    issue_tags: cleanArray(chunk.issueTags || []),
    blockers: cleanArray(chunk.factRequirements || []),
    missing_fact_blockers: cleanArray(chunk.factRequirements || []),
    legal_tree_node_ids: cleanArray(chunk.legalKnowledgeNodeIds || []),
    source_text_fingerprint: chunk.sourceTextFingerprint || "",
    answer_layer: "private_forms_only",
  };
}

function buildAtkinPrivateRecords(store, {
  tenantId = "local_private",
  workspaceId = "",
  firmId = "",
  dimension = DEFAULT_DIMENSION,
} = {}) {
  const scope = { tenantId, workspaceId, firmId };
  const templates = approvedTemplates(store).map(template => {
    const payload = templatePayload(template, scope);
    return {
      point_id: pointId(`template:${payload.template_id}:${payload.workspace_id}`),
      record_kind: "template",
      template_id: payload.template_id,
      payload,
      vector: localHashEmbedding(embeddingSourceForTemplate(template), dimension),
    };
  });
  const templateIds = new Set(templates.map(record => record.template_id));
  const chunks = buildPrivateClauseVectorIndex(store).chunks
    .filter(chunk => templateIds.has(chunk.templateId))
    .map(chunk => {
      const payload = chunkPayload(chunk, scope);
      return {
        point_id: pointId(`chunk:${payload.chunk_id}:${payload.workspace_id}`),
        record_kind: "chunk",
        chunk_id: payload.chunk_id,
        clause_id: payload.clause_id,
        template_id: payload.template_id,
        payload,
        vector: localHashEmbedding(embeddingSourceForChunk(chunk), dimension),
      };
    });
  return {
    index_version: "private-atkin-form-qdrant-records-v1",
    dimension,
    source_visibility: "private_form",
    part_layer: "part_2_forms",
    private_text_committed: false,
    external_embedding_services_used: false,
    records: {
      templates,
      chunks,
    },
  };
}

function requiredTenantWorkspaceFilter({ tenantId, workspaceId, firmId }) {
  return {
    must: [
      { key: "tenant_id", match: { value: tenantId || firmId || "local_private" } },
      { key: "workspace_id", match: { value: workspaceId || "default" } },
      { key: "source_visibility", match: { value: "private_form" } },
      { key: "part_layer", match: { value: "part_2_forms" } },
      { key: "review_status", match: { value: "approved" } },
      { key: "classification_status", match: { value: "review_approved" } },
    ],
  };
}

function addOptionalFilter(must, key, value) {
  if (value) must.push({ key, match: { value } });
}

function addAnyFilter(must, key, values) {
  const clean = cleanArray(values);
  if (clean.length === 1) must.push({ key, match: { value: clean[0] } });
  else if (clean.length > 1) must.push({ key, match: { any: clean } });
}

function buildPrivateQdrantRecallFilter({ matter = {}, routing, tenantId, workspaceId, firmId, documentIntent = "", workflowStage = "" }) {
  const filter = requiredTenantWorkspaceFilter({ tenantId, workspaceId, firmId });
  const must = filter.must;
  const practiceLane = matter.practiceLane || matter.subPracticeArea || matter.practiceArea || "";
  addOptionalFilter(must, "practice_area", matter.practiceArea || "");
  addOptionalFilter(must, "practice_lane", practiceLane);
  addOptionalFilter(must, "workflow_stage", workflowStage || matter.workflowStage || "");
  addOptionalFilter(must, "document_intent", documentIntent || matter.documentIntent || "");
  addOptionalFilter(must, "client_roles", matter.clientRole || "");
  addOptionalFilter(must, "matter_types", matter.matterType || "");
  addAnyFilter(must, "template_id", (routing.recommendedForms || []).map(item => item.template.id));
  return filter;
}

function privateQdrantEnabled(env = process.env) {
  return String(env.PRIVATE_QDRANT_FORMS_ENABLED || "false").toLowerCase() === "true";
}

async function ensureCollection(env, collectionName, dimension) {
  await qdrantRequest(env, `/collections/${encodeURIComponent(collectionName)}`, {
    method: "PUT",
    ok: [200, 201],
    body: {
      vectors: { size: dimension, distance: "Cosine" },
    },
  });
}

async function upsertRecords(env, collectionName, records) {
  if (!records.length) return { collectionName, upserted: 0 };
  await qdrantRequest(env, `/collections/${encodeURIComponent(collectionName)}/points?wait=true`, {
    method: "PUT",
    ok: [200, 201],
    body: {
      points: records.map(record => ({
        id: record.point_id,
        vector: record.vector,
        payload: record.payload,
      })),
    },
  });
  return { collectionName, upserted: records.length };
}

async function indexAtkinPrivateRecordsToQdrant({ store, tenantId, workspaceId, firmId, env = loadEnv(), execute = false, dimension = DEFAULT_DIMENSION } = {}) {
  const collections = privateCollectionNames({ tenantId: tenantId || firmId, workspaceId });
  const built = buildAtkinPrivateRecords(store, { tenantId, workspaceId, firmId, dimension });
  if (!execute) {
    return {
      executed: false,
      collections,
      dimension,
      templates_ready: built.records.templates.length,
      chunks_ready: built.records.chunks.length,
      external_embedding_services_used: false,
      qdrant_required_for_runtime: true,
      private_text_committed: false,
    };
  }
  await ensureCollection(env, collections.templates, dimension);
  await ensureCollection(env, collections.chunks, dimension);
  const templates = await upsertRecords(env, collections.templates, built.records.templates);
  const chunks = await upsertRecords(env, collections.chunks, built.records.chunks);
  return {
    executed: true,
    collections,
    dimension,
    templates_upserted: templates.upserted,
    chunks_upserted: chunks.upserted,
    external_embedding_services_used: false,
    private_text_committed: false,
  };
}

function semanticGateState({ routing }) {
  const recommendedTemplateIds = new Set((routing.recommendedForms || []).map(item => item.template.id));
  const applicableClauseIds = new Set((routing.applicableClauses || []).map(clause => clause.id));
  return {
    recommended_template_count: recommendedTemplateIds.size,
    applicable_clause_count: applicableClauseIds.size,
    blocked_clause_count: (routing.blockedClauses || []).length,
    missing_fact_count: (routing.missingFacts || []).length,
    can_execute_semantic: recommendedTemplateIds.size > 0 && applicableClauseIds.size > 0,
  };
}

function sanitizeQdrantHit(hit, store, includePrivateSnippetText = false) {
  const payload = hit.payload || {};
  const clause = (store.clauses || []).find(item => item.id === payload.clause_id) || {};
  return {
    score: hit.score,
    chunkId: payload.chunk_id || "",
    clauseId: payload.clause_id || "",
    templateId: payload.template_id || "",
    documentIntent: payload.document_intent || "",
    workflowStage: payload.workflow_stage || "",
    practiceLane: payload.practice_lane || "",
    issueTags: payload.issue_tags || [],
    legalTreeNodeIds: payload.legal_tree_node_ids || [],
    privateTextCommitted: false,
    publicAuthority: false,
    snippetText: includePrivateSnippetText ? (clause.text || "") : undefined,
    snippetTextScope: includePrivateSnippetText ? "private_api_response_only" : "not_returned_by_default",
  };
}

async function recallPrivateFormsFromQdrant({
  store,
  matter = {},
  query = "",
  documentIntent = "",
  workflowStage = "",
  env = loadEnv(),
  execute = true,
  topK = 5,
  includePrivateSnippetText = false,
} = {}) {
  const normalizedMatter = { ...inferMatterFromQuery(query), ...matter };
  const routing = routeForms({ store, matter: normalizedMatter, query, documentIntent, workflowStage });
  const gate = semanticGateState({ routing });
  const tenantId = normalizedMatter.tenantId || normalizedMatter.firmId || "local_private";
  const workspaceId = normalizedMatter.workspaceId || "default";
  const firmId = normalizedMatter.firmId || tenantId;
  const collections = privateCollectionNames({ tenantId, workspaceId });
  const filter = buildPrivateQdrantRecallFilter({
    matter: normalizedMatter,
    routing,
    tenantId,
    workspaceId,
    firmId,
    documentIntent,
    workflowStage,
  });
  if (!gate.can_execute_semantic) {
    return {
      recallVersion: "private-qdrant-form-recall-v1",
      qdrantExecuted: false,
      blockedBeforeSemantic: true,
      semanticAfterStructuredFilters: true,
      vectorCannotOverrideStructuredBlockers: true,
      collections,
      filter,
      gate,
      missingFacts: routing.missingFacts || [],
      chunks: [],
      privateTextCommitted: false,
      publicAuthority: false,
    };
  }
  if (!execute || !privateQdrantEnabled(env) || !env.QDRANT_URL) {
    return {
      recallVersion: "private-qdrant-form-recall-v1",
      qdrantExecuted: false,
      dryRun: true,
      disabledReason: !privateQdrantEnabled(env) ? "PRIVATE_QDRANT_FORMS_ENABLED_false" : (!env.QDRANT_URL ? "QDRANT_URL_missing" : "dry_run"),
      blockedBeforeSemantic: false,
      semanticAfterStructuredFilters: true,
      vectorCannotOverrideStructuredBlockers: true,
      collections,
      filter,
      gate,
      privateTextCommitted: false,
      publicAuthority: false,
      chunks: [],
    };
  }
  const vector = localHashEmbedding([
    query,
    normalizedMatter.practiceArea,
    normalizedMatter.practiceLane,
    normalizedMatter.matterType,
    workflowStage || normalizedMatter.workflowStage,
    documentIntent || normalizedMatter.documentIntent,
  ].join(" "), DEFAULT_DIMENSION);
  const result = await qdrantRequest(env, `/collections/${encodeURIComponent(collections.chunks)}/points/search`, {
    method: "POST",
    body: {
      vector,
      filter,
      limit: topK,
      with_payload: true,
    },
  });
  return {
    recallVersion: "private-qdrant-form-recall-v1",
    qdrantExecuted: true,
    blockedBeforeSemantic: false,
    semanticAfterStructuredFilters: true,
    vectorCannotOverrideStructuredBlockers: true,
    collections,
    filter,
    gate,
    returnedCount: (result.result || []).length,
    chunks: (result.result || []).map(hit => sanitizeQdrantHit(hit, store, includePrivateSnippetText)),
    privateTextCommitted: false,
    publicAuthority: false,
  };
}

module.exports = {
  buildAtkinPrivateRecords,
  buildPrivateQdrantRecallFilter,
  indexAtkinPrivateRecordsToQdrant,
  privateCollectionNames,
  privateQdrantEnabled,
  recallPrivateFormsFromQdrant,
  requiredTenantWorkspaceFilter,
  slugForQdrant,
};
