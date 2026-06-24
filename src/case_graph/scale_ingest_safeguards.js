const CRIMINAL_DOMAIN_IDS = new Set(["criminal_procedure_hk", "criminal_law_hk"]);
const CRIMINAL_PRACTICE_AREAS = new Set(["criminal_procedure", "criminal_law"]);
const FORBIDDEN_DOCTRINE_PREFIXES = [
  "tort_law_hk.",
  "data_privacy_hk.",
  "equity_trusts_hk.",
  "probate_law_hk.",
  "civil_procedure_hk.",
  "company_law_hk.",
];

function matchValue(key, value) {
  return { key, match: { value } };
}

function anyOf(key, values) {
  return {
    should: Array.from(values).map(value => matchValue(key, value)),
  };
}

function buildRetrievalScopeFilter({
  sourceMode = "public_demo",
  tenantId = "public",
  includePrivate = false,
  privateIngestionEnabled = false,
  runtimeMode = "",
  domainIds = CRIMINAL_DOMAIN_IDS,
  practiceAreas = CRIMINAL_PRACTICE_AREAS,
} = {}) {
  const publicMust = [
    matchValue("source_visibility", "public_demo"),
    matchValue("tenant_id", "public"),
  ];
  const privateMust = [
    matchValue("source_visibility", "private_tenant"),
    matchValue("tenant_id", tenantId),
  ];
  const domainScope = [
    anyOf("domain_id", domainIds),
    anyOf("practice_area", practiceAreas),
  ];
  const sourceFilter = sourceMode === "private_tenant" && includePrivate && privateIngestionEnabled && tenantId
    ? { should: [{ must: publicMust }, { must: privateMust }] }
    : { must: publicMust };
  if (runtimeMode !== "production_scale") return sourceFilter;
  return {
    must: [
      sourceFilter,
      { should: domainScope },
    ],
  };
}

function extractLegalRefDis(value = "") {
  const match = String(value || "").match(/[?&]DIS=(\d+)/i);
  return match ? match[1] : "";
}

function validateSourceCitationRecord(source = {}) {
  const errors = [];
  const citation = source.neutral_citation || source.citation || "";
  const sourceUrl = source.source_url_or_path || source.source_url || "";
  const fetchUrl = source.fetch_url || "";
  if (!/^\[\d{4}\]\s+HK[A-Z]{2,6}\s+\d+$/i.test(citation)) {
    errors.push("hk_neutral_citation_required");
  }
  if (!/legalref\.judiciary\.hk/i.test(`${sourceUrl} ${fetchUrl}`)) {
    errors.push("legalref_source_required");
  }
  if (!extractLegalRefDis(sourceUrl) && !extractLegalRefDis(fetchUrl)) {
    errors.push("legalref_dis_required");
  }
  if (source.source_visibility !== "public_demo" || source.tenant_id !== "public" || source.licence_status !== "public_judgment") {
    errors.push("public_source_policy_required");
  }
  return {
    source_id: source.source_id || source.case_id || "",
    ok: errors.length === 0,
    errors,
    legalref_dis: extractLegalRefDis(sourceUrl) || extractLegalRefDis(fetchUrl),
    neutral_citation: citation,
  };
}

function domainIdFromDoctrineNodeId(nodeId = "") {
  const [domain] = String(nodeId || "").split(".");
  return domain || "";
}

function validateForbiddenIssueFamilies({ propositions = [], links = [] } = {}) {
  const errors = [];
  const nodeIds = [];
  for (const card of propositions) nodeIds.push(...(card.target_doctrine_node_ids || []));
  for (const link of links) nodeIds.push(link.doctrine_node_id);
  for (const nodeId of nodeIds.filter(Boolean)) {
    if (FORBIDDEN_DOCTRINE_PREFIXES.some(prefix => nodeId.startsWith(prefix))) {
      errors.push({ type: "forbidden_doctrine_family", doctrine_node_id: nodeId });
    }
    const domainId = domainIdFromDoctrineNodeId(nodeId);
    if (domainId && !CRIMINAL_DOMAIN_IDS.has(domainId)) {
      errors.push({ type: "non_criminal_doctrine_node", doctrine_node_id: nodeId });
    }
  }
  return { ok: errors.length === 0, errors };
}

function validateManifestDoctrineAllowlist({ allowedDoctrineNodeIds = [], propositions = [], links = [] } = {}) {
  const allowed = new Set(allowedDoctrineNodeIds || []);
  if (!allowed.size) return { ok: true, errors: [], allowed_count: 0 };
  const errors = [];
  for (const card of propositions) {
    for (const nodeId of card.target_doctrine_node_ids || []) {
      if (!allowed.has(nodeId)) errors.push({ type: "proposition_node_outside_allowlist", proposition_id: card.proposition_id, doctrine_node_id: nodeId });
    }
  }
  for (const link of links) {
    if (!allowed.has(link.doctrine_node_id)) errors.push({ type: "link_node_outside_allowlist", link_id: link.link_id, doctrine_node_id: link.doctrine_node_id });
  }
  return { ok: errors.length === 0, errors, allowed_count: allowed.size };
}

function validateShardRegistryScope({ registryCases = [], allowedScopes = [] } = {}) {
  const allowed = new Set(allowedScopes);
  const errors = [];
  for (const item of registryCases || []) {
    const scope = item.scope || item.branch_scope || item.batch_scope || "";
    if (allowed.size && !allowed.has(scope)) errors.push({ type: "case_scope_not_allowed", case_id: item.case_id || item.source_id, scope });
    const citation = validateSourceCitationRecord(item);
    if (!citation.ok) errors.push({ type: "bad_case_citation", case_id: item.case_id || item.source_id, errors: citation.errors });
  }
  return { ok: errors.length === 0, errors, allowed_scopes: Array.from(allowed) };
}

function postScaleSafeguardReport({
  manifest = {},
  propositions = [],
  links = [],
  allowedDoctrineNodeIds = [],
} = {}) {
  const citationResults = (manifest.sources || []).map(validateSourceCitationRecord);
  const familyResult = validateForbiddenIssueFamilies({ propositions, links });
  const allowlistResult = validateManifestDoctrineAllowlist({ allowedDoctrineNodeIds, propositions, links });
  const errors = [
    ...citationResults.flatMap(item => item.ok ? [] : item.errors.map(error => ({ type: error, source_id: item.source_id }))),
    ...familyResult.errors,
    ...allowlistResult.errors,
  ];
  return {
    report_id: "post_scale_ingest_safeguard_report_v1",
    batch_id: manifest.batch_id || "",
    domain_id: manifest.domain_id || "",
    citation_records_ok: citationResults.every(item => item.ok),
    forbidden_issue_families_ok: familyResult.ok,
    doctrine_allowlist_ok: allowlistResult.ok,
    status: errors.length ? "blocked" : "passed",
    errors,
  };
}

module.exports = {
  CRIMINAL_DOMAIN_IDS,
  CRIMINAL_PRACTICE_AREAS,
  FORBIDDEN_DOCTRINE_PREFIXES,
  buildRetrievalScopeFilter,
  domainIdFromDoctrineNodeId,
  postScaleSafeguardReport,
  validateForbiddenIssueFamilies,
  validateManifestDoctrineAllowlist,
  validateShardRegistryScope,
  validateSourceCitationRecord,
};
