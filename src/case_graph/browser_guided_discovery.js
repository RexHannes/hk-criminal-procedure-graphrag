const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_BROWSER_POLICY = path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "browser_discovery_policy.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function loadBrowserDiscoveryPolicy(policyPath = DEFAULT_BROWSER_POLICY) {
  return readJson(policyPath);
}

function hostnameForUrl(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isAllowedPublicSourceUrl(url, policy = loadBrowserDiscoveryPolicy()) {
  const host = hostnameForUrl(url);
  return Boolean(host && (policy.allowed_domains || []).some(domain => host === domain || host.endsWith(`.${domain}`)));
}

function assertAllowedPublicSourceUrl(url, policy = loadBrowserDiscoveryPolicy()) {
  if (!isAllowedPublicSourceUrl(url, policy)) {
    throw new Error(`browser discovery URL outside allowlist: ${url}`);
  }
  return true;
}

function normalizeSeedStatus(source) {
  if (source === "deepseek") return "llm_unverified_seed";
  if (source === "book") return "book_derived_seed";
  if (source === "tree") return "tree_query_seed";
  if (source === "search") return "search_result_candidate";
  return "search_result_candidate";
}

function normalizeCaseSeed(seed, { branchId, source = "search", policy = loadBrowserDiscoveryPolicy() } = {}) {
  const status = seed.status || normalizeSeedStatus(source);
  if (!(policy.status_lifecycle || []).includes(status)) {
    throw new Error(`unknown discovery status: ${status}`);
  }
  if (status === "answer_safe") {
    throw new Error("browser discovery cannot create answer_safe seeds");
  }
  return {
    seed_id: seed.seed_id || `case_seed_${sha256(`${branchId}:${source}:${seed.case_name || seed.possible_citation || seed.source_url || ""}`).slice(0, 16)}`,
    branch_id: branchId,
    status,
    seed_source: source,
    case_name: seed.case_name || "",
    possible_citation: seed.possible_citation || seed.neutral_citation || "",
    source_url: seed.source_url || "",
    reason_for_relevance: seed.reason_for_relevance || "",
    suggested_issue_tags: seed.suggested_issue_tags || [],
    review_status: "machine_candidate",
    answer_layer_status: "research_only",
  };
}

function buildBranchSearchQueries({ branchId, label = "", statuteRefs = [], seedTerms = [], maxQueries = 12 } = {}) {
  const baseTerms = [
    label,
    ...statuteRefs,
    ...seedTerms,
  ]
    .map(item => String(item || "").trim())
    .filter(Boolean);
  const uniqueTerms = [...new Set(baseTerms)];
  const roots = uniqueTerms.length ? uniqueTerms : [branchId];
  const templates = [
    term => `"${term}" bail Hong Kong judgment`,
    term => `"${term}" "HKCFA" bail`,
    term => `"${term}" "HKCFI" bail`,
    term => `"${term}" "national security" bail Hong Kong`,
    term => `site:legalref.judiciary.hk "${term}" bail`,
    term => `site:hklii.hk "${term}" bail Hong Kong`,
  ];
  const queries = [];
  for (const term of roots) {
    for (const template of templates) {
      queries.push({
        branch_id: branchId,
        query: template(term),
        status: "tree_query_seed",
        source: "deterministic_query_template",
      });
      if (queries.length >= maxQueries) return queries;
    }
  }
  return queries;
}

function verifyPublicCaseCandidate(candidate, { fetchedText = "", policy = loadBrowserDiscoveryPolicy() } = {}) {
  const errors = [];
  if (!candidate.case_name) errors.push("case_title_missing");
  if (!candidate.possible_citation && !candidate.neutral_citation && !candidate.source_citation) errors.push("citation_missing");
  if (!candidate.source_url) errors.push("source_url_missing");
  if (candidate.source_url && !isAllowedPublicSourceUrl(candidate.source_url, policy)) errors.push("source_url_not_allowlisted");
  const checksum = candidate.source_checksum || (fetchedText ? sha256(fetchedText) : "");
  if (!checksum) errors.push("source_checksum_missing");
  if (candidate.answer_layer_status === "answer_safe" || candidate.answer_safe === true) errors.push("answer_safe_forbidden");
  return {
    ...candidate,
    source_checksum: checksum,
    status: errors.length ? "rejected" : "verified_public_case",
    verification_errors: errors,
    review_status: "machine_candidate",
    answer_layer_status: "research_only",
  };
}

function validateLineageEvidence({ judgmentText = "", citedCase = "", relation = "", humanReviewed = false, policy = loadBrowserDiscoveryPolicy() } = {}) {
  if (humanReviewed) return { ok: true, status: "human_reviewed_lineage" };
  const haystack = String(judgmentText || "").toLowerCase();
  const cited = String(citedCase || "").toLowerCase();
  const rel = String(relation || "").toLowerCase();
  const relationAllowed = (policy.lineage_policy?.relation_terms || []).some(term => rel.includes(term));
  const citedAppears = cited && haystack.includes(cited);
  const relationAppears = rel && haystack.includes(rel);
  return {
    ok: Boolean(citedAppears && relationAllowed && relationAppears),
    status: citedAppears && relationAllowed && relationAppears ? "text_supported_lineage" : "lineage_needs_review",
    cited_case_found: Boolean(citedAppears),
    relation_allowed: Boolean(relationAllowed),
    relation_found: Boolean(relationAppears),
  };
}

module.exports = {
  DEFAULT_BROWSER_POLICY,
  assertAllowedPublicSourceUrl,
  buildBranchSearchQueries,
  isAllowedPublicSourceUrl,
  loadBrowserDiscoveryPolicy,
  normalizeCaseSeed,
  validateLineageEvidence,
  verifyPublicCaseCandidate,
};
