// Post-10k mass ingest safeguards: domain isolation, citation precision, shard scope, tree allow-lists.

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_REGISTRY = path.join(
  ROOT,
  "data",
  "legal_ingest",
  "criminal_evidence_tree_v1",
  "case_registry_public_v1.json",
);

const CRIMINAL_DOMAIN_IDS = new Set(["criminal_procedure_hk", "criminal_law_hk", "criminal_evidence"]);

const ALLOWED_CRIMINAL_CASE_SCOPES = new Set([
  "bail_only",
  "public_order_riot",
  "sedition_public_expression",
  "investigation_arrest_search_detention",
  "theft_dishonesty_fraud",
  "criminal_domain_public_cases",
]);

const FORBIDDEN_DOCTRINE_DOMAIN_PREFIXES = [
  "tort_law_hk.",
  "equity_trusts_hk.",
  "data_privacy_hk.",
  "probate_law_hk.",
  "family_law_hk.",
  "employment_law_hk.",
  "land_law_hk.",
];

const FORBIDDEN_TREE_NODE_PREFIXES = [
  "tort_law.",
  "equity_trusts.",
  "data_privacy.",
  "probate_law.",
  "family_law.",
];

const HK_NEUTRAL_CITATION_RE = /^\[\d{4}\]\s+HK[A-Z0-9]+\s+\d+/i;

function parseAllowedDomainIds(env = process.env) {
  const raw = String(env.LEGAL_RETRIEVAL_ALLOWED_DOMAIN_IDS || "criminal_procedure_hk,criminal_law_hk").trim();
  return raw.split(",").map(item => item.trim()).filter(Boolean);
}

function retrievalScopePolicy(env = process.env) {
  const runtimeMode = String(env.LEGAL_RUNTIME_MODE || "development").trim().toLowerCase();
  const allowedDomainIds = parseAllowedDomainIds(env);
  const vectorScope = String(env.LEGAL_RETRIEVAL_VECTOR_SCOPE || "").trim();
  const practiceArea = String(env.LEGAL_RETRIEVAL_PRACTICE_AREA || "criminal_procedure").trim();
  const enforced = runtimeMode === "production_scale" || String(env.LEGAL_RETRIEVAL_DOMAIN_LOCK || "true").toLowerCase() !== "false";
  return {
    enforced,
    allowed_domain_ids: allowedDomainIds,
    vector_scope: vectorScope,
    practice_area: practiceArea,
    runtime_mode: runtimeMode,
  };
}

function matchValue(key, value) {
  return { key, match: { value } };
}

function matchAny(key, values) {
  return {
    key,
    match: { any: values.map(value => ({ value })) },
  };
}

function buildRetrievalScopeFilter(env = process.env, {
  sourceMode = "public_demo",
  tenantId = "public",
  includePrivate = false,
  privateIngestionEnabled = false,
  domainIds = null,
  vectorScope = "",
  practiceArea = "",
} = {}) {
  const policy = retrievalScopePolicy(env);
  const must = [];
  if (sourceMode === "private_tenant" && includePrivate && privateIngestionEnabled && tenantId) {
    must.push(matchValue("tenant_id", tenantId));
  } else {
    must.push(matchValue("source_visibility", "public_demo"));
    must.push(matchValue("tenant_id", "public"));
  }
  const domains = domainIds || (policy.enforced ? policy.allowed_domain_ids : []);
  if (domains.length === 1) must.push(matchValue("domain_id", domains[0]));
  else if (domains.length > 1) must.push(matchAny("domain_id", domains));
  const scope = vectorScope || policy.vector_scope;
  if (scope) must.push(matchValue("vector_scope", scope));
  const area = practiceArea || policy.practice_area;
  if (policy.enforced && area) must.push(matchValue("practice_area", area));
  return { must };
}

function extractLegalRefDis(url = "") {
  const match = String(url || "").match(/[?&]DIS=(\d+)/i);
  return match ? match[1] : "";
}

function validateNeutralCitation(citation = "") {
  const normalized = String(citation || "").trim();
  if (!normalized) return "missing_neutral_citation";
  if (!HK_NEUTRAL_CITATION_RE.test(normalized)) return `invalid_neutral_citation_format:${normalized}`;
  return "";
}

function validateSourceCitationRecord(source = {}) {
  const errors = [];
  const citationError = validateNeutralCitation(source.neutral_citation);
  if (citationError) errors.push({ type: "citation_invalid", source_id: source.source_id, message: citationError });
  const dis = extractLegalRefDis(source.fetch_url || source.source_url_or_path || "");
  if (!dis) {
    errors.push({
      type: "missing_legalref_dis",
      source_id: source.source_id,
      message: "Public HK judgments must pin a LegalRef DIS in fetch_url or source_url_or_path.",
    });
  }
  if (source.source_visibility !== "public_demo" || source.tenant_id !== "public") {
    errors.push({ type: "forbidden_source_policy", source_id: source.source_id });
  }
  return errors;
}

function isForbiddenDoctrineDomain(doctrineNodeId = "") {
  const normalized = String(doctrineNodeId || "").trim();
  if (!normalized) return false;
  return FORBIDDEN_DOCTRINE_DOMAIN_PREFIXES.some(prefix => normalized.startsWith(prefix));
}

function isForbiddenTreeNode(treeNodeId = "") {
  const normalized = String(treeNodeId || "").trim();
  if (!normalized) return false;
  if (FORBIDDEN_TREE_NODE_PREFIXES.some(prefix => normalized.startsWith(prefix))) return true;
  return !/^(criminal_evidence|criminal_procedure)\./.test(normalized);
}

function validateDoctrineTargets({
  doctrineNodeIds = [],
  allowedDoctrineNodeIds = [],
  allowedDomainId = "criminal_procedure_hk",
} = {}) {
  const errors = [];
  const allowed = new Set(allowedDoctrineNodeIds || []);
  for (const doctrineNodeId of doctrineNodeIds) {
    if (isForbiddenDoctrineDomain(doctrineNodeId)) {
      errors.push({
        type: "forbidden_issue_family_leakage",
        doctrine_node_id: doctrineNodeId,
        message: "Doctrine node belongs to a non-criminal domain pack.",
      });
      continue;
    }
    if (allowedDomainId && !String(doctrineNodeId).startsWith(`${allowedDomainId}.`)) {
      errors.push({
        type: "forbidden_issue_family_leakage",
        doctrine_node_id: doctrineNodeId,
        message: `Doctrine node is outside allowed domain ${allowedDomainId}.`,
      });
    }
    if (allowed.size && !allowed.has(doctrineNodeId)) {
      errors.push({
        type: "wrong_branch_candidate",
        doctrine_node_id: doctrineNodeId,
        message: "Doctrine node is outside manifest/loop allow-list.",
      });
    }
  }
  return errors;
}

function validateTreeNodeTargets(treeNodeIds = []) {
  const errors = [];
  for (const treeNodeId of treeNodeIds || []) {
    if (isForbiddenTreeNode(treeNodeId)) {
      errors.push({
        type: "forbidden_issue_family_leakage",
        tree_node_id: treeNodeId,
        message: "Tree node is outside criminal evidence/procedure families.",
      });
    }
  }
  return errors;
}

function validateManifestDoctrineAllowlist(manifest = {}, propositionCards = []) {
  const manifestAllow = new Set(manifest.target_doctrine_node_ids || []);
  if (!manifestAllow.size) return [];
  const errors = [];
  for (const card of propositionCards || []) {
    for (const doctrineNodeId of card.target_doctrine_node_ids || []) {
      if (!manifestAllow.has(doctrineNodeId)) {
        errors.push({
          type: "wrong_branch_candidate",
          proposition_id: card.proposition_id,
          doctrine_node_id: doctrineNodeId,
          message: "Proposition targets a doctrine node outside batch manifest allow-list.",
        });
      }
    }
  }
  return errors;
}

function validateRegistryCaseScope(caseRecord = {}, planScope = "criminal_domain_public_cases") {
  const errors = [];
  if (!caseRecord) return errors;
  if (caseRecord.source_visibility !== "public_demo" || caseRecord.tenant_id !== "public") {
    errors.push({ type: "forbidden_source_policy", case_id: caseRecord.case_id });
  }
  const caseScope = String(caseRecord.scope || "").trim();
  if (planScope === "criminal_domain_public_cases") {
    if (caseScope && !ALLOWED_CRIMINAL_CASE_SCOPES.has(caseScope)) {
      errors.push({
        type: "forbidden_issue_family_leakage",
        case_id: caseRecord.case_id,
        scope: caseScope,
        message: "Registry case scope is outside allowed criminal public-demo scopes.",
      });
    }
  } else if (caseScope && caseScope !== planScope) {
    errors.push({
      type: "shard_scope_mismatch",
      case_id: caseRecord.case_id,
      scope: caseScope,
      plan_scope: planScope,
    });
  }
  const citationError = validateNeutralCitation(caseRecord.neutral_citation);
  if (citationError) {
    errors.push({ type: "citation_invalid", case_id: caseRecord.case_id, message: citationError });
  }
  const dis = extractLegalRefDis(caseRecord.source_url_or_path || "");
  if (!dis) {
    errors.push({ type: "missing_legalref_dis", case_id: caseRecord.case_id });
  }
  return errors;
}

function validateShardRegistryScope({
  plan = {},
  shard = {},
  registryPath = DEFAULT_REGISTRY,
} = {}) {
  if (!fs.existsSync(registryPath)) {
    return {
      ok: false,
      errors: [{ type: "registry_missing", registry_path: registryPath }],
      seeded_cases: [],
    };
  }
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  const start = Number(shard.case_ordinal_start || 1);
  const end = Number(shard.case_ordinal_end || start);
  const seeded = (registry.cases || []).filter(item => item.case_ordinal >= start && item.case_ordinal <= end);
  const errors = [];
  for (const caseRecord of seeded) {
    errors.push(...validateRegistryCaseScope(caseRecord, plan.scope || "criminal_domain_public_cases"));
  }
  const batchIds = new Set(seeded.map(item => item.batch_id).filter(Boolean));
  return {
    ok: errors.length === 0,
    errors,
    seeded_cases: seeded.map(item => item.case_id),
    batch_ids: Array.from(batchIds),
    registry_id: registry.registry_id,
  };
}

function isCriminalDomainRetrievalScopeEnforced(env = process.env) {
  const policy = retrievalScopePolicy(env);
  if (!policy.enforced) return true;
  return policy.allowed_domain_ids.every(id => CRIMINAL_DOMAIN_IDS.has(id) || id.startsWith("criminal_"));
}

function postScaleSafeguardReport(env = process.env) {
  const policy = retrievalScopePolicy(env);
  return {
    safeguard_id: "post_10k_scale_ingest_safeguards_v1",
    retrieval_scope: policy,
    criminal_domain_lock: isCriminalDomainRetrievalScopeEnforced(env),
    allowed_case_scopes: Array.from(ALLOWED_CRIMINAL_CASE_SCOPES),
    forbidden_doctrine_prefixes: FORBIDDEN_DOCTRINE_DOMAIN_PREFIXES,
    citation_policy: {
      neutral_citation_pattern: HK_NEUTRAL_CITATION_RE.source,
      legalref_dis_required: true,
      preferred_source_of_record: "legalref.judiciary.hk",
      hklii_role: "discovery_only_until_legalref_verified",
    },
    storage_policy: {
      candidate_only_default: true,
      auto_answer_safe_forbidden: true,
      bulk_auto_attach_forbidden: true,
      supabase_answer_safe_requires_approved: true,
      qdrant_prod_namespace_required: policy.runtime_mode === "production_scale",
    },
  };
}

module.exports = {
  ALLOWED_CRIMINAL_CASE_SCOPES,
  CRIMINAL_DOMAIN_IDS,
  DEFAULT_REGISTRY,
  FORBIDDEN_DOCTRINE_DOMAIN_PREFIXES,
  HK_NEUTRAL_CITATION_RE,
  buildRetrievalScopeFilter,
  extractLegalRefDis,
  isCriminalDomainRetrievalScopeEnforced,
  isForbiddenDoctrineDomain,
  isForbiddenTreeNode,
  postScaleSafeguardReport,
  retrievalScopePolicy,
  validateDoctrineTargets,
  validateManifestDoctrineAllowlist,
  validateNeutralCitation,
  validateRegistryCaseScope,
  validateShardRegistryScope,
  validateSourceCitationRecord,
  validateTreeNodeTargets,
};
