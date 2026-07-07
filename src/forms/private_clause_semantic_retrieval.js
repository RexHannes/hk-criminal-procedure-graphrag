const crypto = require("crypto");
const { inferMatterFromQuery } = require("./form_system");

const VECTOR_DIMENSIONS = 64;
const VECTOR_MODEL = "local_private_hash_embedding_v1";

function tokenize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter(token => token.length > 1);
}

function hashIndex(token) {
  const hex = crypto.createHash("sha256").update(token).digest("hex").slice(0, 8);
  return parseInt(hex, 16) % VECTOR_DIMENSIONS;
}

function vectorize(value) {
  const vector = Array(VECTOR_DIMENSIONS).fill(0);
  for (const token of tokenize(value)) vector[hashIndex(token)] += 1;
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map(value => Number((value / norm).toFixed(6)));
}

function cosine(a, b) {
  let score = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) score += a[i] * b[i];
  return Number(score.toFixed(6));
}

function sha(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function normalizeMatter({ matter = {}, query = "", documentIntent = "", workflowStage = "" }) {
  const inferred = inferMatterFromQuery(query);
  return {
    ...inferred,
    ...matter,
    documentIntent: documentIntent || matter.documentIntent || inferred.documentIntent || "",
    workflowStage: workflowStage || matter.workflowStage || inferred.workflowStage || "",
    practiceLane: matter.practiceLane || matter.subPracticeArea || inferred.matterType || "",
  };
}

function templateForClause(store, clause) {
  return (store.templates || []).find(template => template.id === clause.templateId) || {};
}

function legalNodeIdsFor(template, clause) {
  const explicit = [
    ...(template.legalKnowledgeNodeIds || []),
    ...(clause.legalKnowledgeNodeIds || []),
  ];
  if (explicit.length) return Array.from(new Set(explicit));
  const tags = new Set([...(clause.issueTags || []), template.practiceArea, template.subPracticeArea, template.documentIntent].filter(Boolean));
  return Array.from(tags).map(tag => `legal_tree:${tag}`);
}

function buildPrivateClauseVectorIndex(store) {
  const chunks = [];
  for (const clause of store.clauses || []) {
    const template = templateForClause(store, clause);
    if (clause.reviewStatus !== "approved") continue;
    if (template.reviewStatus !== "approved" || template.classificationStatus !== "review_approved") continue;
    const semanticSource = [
      clause.heading,
      clause.clauseType,
      clause.documentIntent,
      clause.proceduralStage,
      ...(clause.issueTags || []),
      ...(clause.useWhen || []),
      ...(clause.factRequirements || []),
      template.title,
      template.practiceArea,
      template.subPracticeArea,
      ...(template.applicableMatterTypes || []),
      ...(template.applicableRoles || []),
    ].join(" ");
    chunks.push({
      chunkId: `private_clause_chunk:${clause.id}`,
      sourceKind: "PRIVATE_APPROVED_CLAUSE_CHUNK",
      storageScope: "private_store_only",
      rawTextStored: false,
      privateTextCommitted: false,
      publicAuthority: false,
      reviewStatus: "approved",
      classificationStatus: "review_approved",
      clauseId: clause.id,
      templateId: clause.templateId,
      firmId: template.firmId || "",
      workspaceId: template.workspaceId || "",
      practiceArea: template.practiceArea || "",
      practiceLane: template.subPracticeArea || template.practiceLane || template.practiceArea || "",
      workflowStage: clause.proceduralStage || template.proceduralStage || "",
      documentIntent: clause.documentIntent || template.documentIntent || "",
      clientRoles: template.applicableRoles || [],
      matterTypes: template.applicableMatterTypes || [],
      clauseType: clause.clauseType || "",
      issueTags: clause.issueTags || [],
      factRequirements: clause.factRequirements || [],
      legalKnowledgeNodeIds: legalNodeIdsFor(template, clause),
      notebooklmUsageNoteIds: clause.notebooklmUsageNoteIds || [],
      notebooklmProvenance: "INTERNAL_USAGE_NOTE",
      sourceTextFingerprint: sha(`${clause.heading || ""}\n${clause.text || ""}`),
      embedding: {
        model: VECTOR_MODEL,
        dimensions: VECTOR_DIMENSIONS,
        vector: vectorize(semanticSource),
        externalServicesUsed: false,
        containsRawText: false,
      },
    });
  }
  return {
    indexVersion: "private-approved-clause-vector-index-v1",
    retrievalPolicy: "structured_filters_before_private_semantic_retrieval",
    privateTextCommitted: false,
    publicAuthority: false,
    rawTextStored: false,
    reviewedOnly: true,
    chunks,
  };
}

function arrayMatches(value, allowed) {
  if (!value) return true;
  if (!Array.isArray(allowed) || !allowed.length) return true;
  return allowed.includes(value) || allowed.includes("general_matter");
}

function chunkMatchesStructuredFilters(chunk, matter) {
  if (matter.practiceArea && chunk.practiceArea !== matter.practiceArea) return false;
  if (matter.practiceLane && chunk.practiceLane && chunk.practiceLane !== matter.practiceLane) {
    if (!(chunk.issueTags || []).includes(matter.practiceLane)) return false;
  }
  if (matter.workflowStage && chunk.workflowStage !== matter.workflowStage) return false;
  if (matter.documentIntent && chunk.documentIntent !== matter.documentIntent) return false;
  if (!arrayMatches(matter.clientRole, chunk.clientRoles)) return false;
  if (!arrayMatches(matter.matterType, chunk.matterTypes)) return false;
  return true;
}

function retrieveApprovedPrivateClauseChunks({
  store,
  routing,
  matter = {},
  query = "",
  documentIntent = "",
  workflowStage = "",
  limit = 5,
}) {
  const normalizedMatter = normalizeMatter({ matter, query, documentIntent, workflowStage });
  const index = buildPrivateClauseVectorIndex(store);
  const recommendedTemplateIds = new Set((routing.recommendedForms || []).map(item => item.template.id));
  const applicableClauseIds = new Set((routing.applicableClauses || []).map(clause => clause.id));
  const blockedClauseIds = new Set((routing.blockedClauses || []).map(item => item.clause.id));
  const queryVector = vectorize([
    query,
    normalizedMatter.practiceArea,
    normalizedMatter.practiceLane,
    normalizedMatter.matterType,
    normalizedMatter.workflowStage,
    normalizedMatter.documentIntent,
  ].join(" "));

  const policySteps = [
    "practice_lane_filter",
    "workflow_stage_filter",
    "document_intent_filter",
    "client_role_matter_type_filter",
    "missing_fact_blocker_filter",
    "semantic_vector_retrieval",
  ];
  const structuredCandidateChunks = index.chunks
    .filter(chunk => recommendedTemplateIds.has(chunk.templateId))
    .filter(chunk => chunkMatchesStructuredFilters(chunk, normalizedMatter));
  const afterMissingFactBlockers = structuredCandidateChunks
    .filter(chunk => applicableClauseIds.has(chunk.clauseId) && !blockedClauseIds.has(chunk.clauseId));
  const semanticExecuted = afterMissingFactBlockers.length > 0;
  const ranked = afterMissingFactBlockers
    .map(chunk => ({
      ...chunk,
      semanticScore: cosine(queryVector, chunk.embedding.vector),
    }))
    .sort((a, b) => b.semanticScore - a.semanticScore)
    .slice(0, limit)
    .map(({ embedding, ...chunk }) => chunk);

  return {
    retrievalVersion: "private-approved-clause-semantic-retrieval-v1",
    retrievalOrder: policySteps,
    structuredFiltersFirst: true,
    semanticAfterStructuredFilters: true,
    semanticExecuted,
    blockedBeforeSemantic: !semanticExecuted,
    vectorCannotOverrideStructuredBlockers: true,
    privateTextCommitted: false,
    publicAuthority: false,
    reviewedOnly: true,
    notebooklmRuntimeEngine: false,
    notebooklmProvenance: "INTERNAL_USAGE_NOTE",
    indexStats: {
      approvedPrivateChunks: index.chunks.length,
      structuredCandidates: structuredCandidateChunks.length,
      missingFactBlockedChunks: structuredCandidateChunks.length - afterMissingFactBlockers.length,
      returnedChunks: ranked.length,
    },
    blockedClauseIds: Array.from(blockedClauseIds),
    missingFacts: routing.missingFacts || [],
    chunks: ranked,
  };
}

module.exports = {
  buildPrivateClauseVectorIndex,
  retrieveApprovedPrivateClauseChunks,
  vectorize,
};
