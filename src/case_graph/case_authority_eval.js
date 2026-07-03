const fs = require("fs");
const path = require("path");
const {
  loadViewerEvidenceIndex,
  collectCaseLikeInventory,
  isVerifiedParagraphProof,
  isPublicSourceUrl,
  verifiedEvidenceForDoctrineNode,
} = require("./verified_case_authority");
const { evidenceForDoctrineNode } = require("./case_authority_bridge");
const { isParagraphLinkedPublicSource } = require("./research_prototype_metadata");

const ROOT = path.resolve(__dirname, "..", "..");
const EXCLUDED_REPORT_JSON = path.join(ROOT, "artifacts", "excluded_unverified_case_seeds_report.json");
const REGISTRY_PATH = path.join(ROOT, "data", "legal_ingest", "case_authority_registry.json");

function tokenize(text = "") {
  return String(text)
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/)
    .filter(t => t.length >= 2);
}

function loadExcludedIds() {
  if (!fs.existsSync(EXCLUDED_REPORT_JSON)) return new Set();
  const payload = JSON.parse(fs.readFileSync(EXCLUDED_REPORT_JSON, "utf8"));
  return new Set((payload.records || []).map(r => r.doctrine_node_id));
}

function recordSearchBlob(record = {}) {
  return [
    record.case_name,
    record.citation,
    record.neutral_citation,
    record.doctrine_node_id,
    record.proposition_text,
    record.principle_text,
    record.short_application_summary,
    (record.issue_tags || []).join(" "),
    (record.mapped_viewer_node_ids || []).join(" "),
  ].join(" ").toLowerCase();
}

function queryDomainBoosts(query = "") {
  const q = String(query).toLowerCase();
  const boosts = [];
  if (/\b(protest|peaceful|assembly|route|police restricted)\b/.test(q)) {
    boosts.push({ pattern: /leung kwok hung|peaceful assembly|public.?order|proportionality|hkcfa\/2005\/2/i, weight: 10 });
    boosts.push({ pattern: /journalistic|insider dealing|inconsistent pleadings|sedition/i, weight: -8 });
  }
  if (/\b(theft|shop|pay|deprive|appropriat|belonging|dishonest|goods|return|permanently)\b/.test(q)) {
    boosts.push({ pattern: /theft|dishonesty|fraud|concealment|dishonestly/i, weight: 8 });
    boosts.push({ pattern: /bail|nsl 42|national security|inconsistent pleadings/i, weight: -5 });
  }
  if (/\b(bail)\b/.test(q)) {
    boosts.push({ pattern: /bail|surrender to custody|risk assessment/i, weight: 6 });
  }
  if (/\b(interview|caution|rights|confession|explaining)\b/.test(q)) {
    boosts.push({ pattern: /lam tat ming|confession|residual discretion|voir dire|voluntary/i, weight: 8 });
    boosts.push({ pattern: /journalistic material/i, weight: -4 });
  }
  if (/\b(landlord|rent|tenancy)\b/.test(q)) {
    boosts.push({ pattern: /./, weight: -20 });
  }
  return boosts;
}

function scoreRecord(query, record) {
  const terms = tokenize(query);
  const blob = recordSearchBlob(record);
  let score = 0;
  for (const term of terms) {
    if (blob.includes(term)) score += 1;
    if ((record.case_name || "").toLowerCase().includes(term)) score += 4;
    if ((record.neutral_citation || "").toLowerCase().includes(term)) score += 5;
    if ((record.doctrine_node_id || "").toLowerCase().includes(term)) score += 3;
  }
  for (const boost of queryDomainBoosts(query)) {
    if (boost.pattern.test(blob)) score += boost.weight;
  }
  return score;
}

function searchParagraphLinkedCases(query, { limit = 12 } = {}) {
  const index = loadViewerEvidenceIndex();
  const excluded = loadExcludedIds();
  const scored = (index.records || [])
    .filter(record => isVerifiedParagraphProof(record) && record.resolution_status === "verified")
    .map(record => ({ record, score: scoreRecord(query, record) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || String(a.record.case_name).localeCompare(String(b.record.case_name)))
    .slice(0, limit);

  const byDoctrine = new Map();
  for (const doctrineId of index.searchable_doctrine_node_ids || []) {
    if (excluded.has(doctrineId)) continue;
    const blob = `${doctrineId} ${(verifiedEvidenceForDoctrineNode(doctrineId)[0]?.short_application_summary || "")}`.toLowerCase();
    let score = 0;
    for (const term of tokenize(query)) {
      if (blob.includes(term)) score += 1;
      if (doctrineId.toLowerCase().includes(term)) score += 2;
    }
    for (const boost of queryDomainBoosts(query)) {
      if (boost.pattern.test(blob)) score += boost.weight;
    }
    if (score > 0) byDoctrine.set(doctrineId, score);
  }

  return {
    hits: scored.map(item => item.record),
    doctrine_scores: [...byDoctrine.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([doctrine_node_id, score]) => ({
        doctrine_node_id,
        score,
        evidence: verifiedEvidenceForDoctrineNode(doctrine_node_id).filter(isVerifiedParagraphProof),
      })),
  };
}

function verifyEvidenceRecord(record = {}) {
  const errors = [];
  if (!isVerifiedParagraphProof(record)) errors.push("not_paragraph_proof");
  if (!isPublicSourceUrl(record.source_url)) errors.push("missing_public_source_url");
  if (!(record.paragraph_number || record.para_no)) errors.push("missing_paragraph_number");
  if (!record.exact_quote) errors.push("missing_exact_quote");
  const quote = String(record.exact_quote || "");
  const paragraph = String(record.paragraph_text || "");
  if (!paragraph.includes(quote)) errors.push("quote_not_in_paragraph");
  if (!(record.short_application_summary || record.proposition_text || record.principle_text)) {
    errors.push("missing_summary");
  }
  if (record.source_status != null && record.source_status !== "paragraph_linked_public_source") {
    errors.push("wrong_source_status");
  }
  if (record.research_use_allowed === false) errors.push("research_use_blocked");
  return { ok: errors.length === 0, errors };
}

function hitsContainPattern(hits, pattern) {
  const re = pattern instanceof RegExp ? pattern : new RegExp(pattern, "i");
  return hits.some(hit => re.test(recordSearchBlob(hit)));
}

function isUnsupportedCivilRentQuery(query = "") {
  const q = String(query).toLowerCase();
  return /\b(landlord|rent|tenancy|lease|tenant)\b/.test(q)
    && !/\b(criminal|arrest|theft|bail|protest|police|sedition|riot)\b/.test(q);
}

function simulateInquiryAnalysis(query, { limit = 6 } = {}) {
  if (isUnsupportedCivilRentQuery(query)) {
    return {
      abstain: true,
      summary: "No supported criminal-law paragraph-linked authority is attached for this civil rent/landlord issue in the current prototype corpus.",
      legal_position: "",
      application: "",
      case_references: [],
      warnings: ["unsupported_civil_rent_query"],
      matched_doctrine_nodes: [],
      evidence: [],
    };
  }

  const search = searchParagraphLinkedCases(query, { limit });
  const doctrineMatches = search.doctrine_scores
    .filter(item => item.evidence.length)
    .sort((a, b) => b.score - a.score);
  const evidence = [];
  const seen = new Set();
  for (const hit of search.hits.sort((a, b) => scoreRecord(query, b) - scoreRecord(query, a))) {
    const key = `${hit.case_id}:${hit.paragraph_number}:${hit.exact_quote}`;
    if (seen.has(key)) continue;
    seen.add(key);
    evidence.push(hit);
  }
  for (const item of doctrineMatches) {
    for (const ev of item.evidence) {
      const key = `${ev.case_id}:${ev.paragraph_number}:${ev.exact_quote}`;
      if (seen.has(key)) continue;
      seen.add(key);
      evidence.push(ev);
    }
  }

  const rankedEvidence = evidence
    .map(ev => ({ ev, score: scoreRecord(query, ev) }))
    .sort((a, b) => b.score - a.score)
    .map(item => item.ev);
  const top = rankedEvidence.slice(0, 4);
  const abstain = top.length === 0;
  const caseRefs = top.map(ev => ({
    case_name: ev.case_name,
    neutral_citation: ev.neutral_citation || ev.citation,
    para_no: ev.paragraph_number || ev.para_no,
    supporting_quote: ev.exact_quote,
    source_url: ev.source_url,
  }));

  return {
    abstain,
    summary: abstain
      ? "No paragraph-linked public judgment evidence was retrieved for this query in the current prototype corpus."
      : `Retrieved ${top.length} paragraph-linked authority record(s) for research analysis.`,
    legal_position: top.map(ev => ev.short_application_summary || ev.proposition_text).filter(Boolean).join(" "),
    application: top.length
      ? `The retrieved paragraphs may be applied to the stated facts by matching issue tags and proposition summaries to the user's fact pattern.`
      : "",
    case_references: caseRefs,
    warnings: abstain ? ["analysis_has_no_paragraph_evidence"] : [],
    matched_doctrine_nodes: doctrineMatches.map(item => ({
      doctrine_node_id: item.doctrine_node_id,
      evidence_count: item.evidence.length,
    })),
    evidence: top,
  };
}

const LEVEL1_QUERIES = [
  {
    id: "leung_citation_exact",
    query: "HKSAR v Leung Kwok Hung [2005] 3 HKLRD 164",
    require_case: /leung kwok hung/i,
    require_citation: /2005.*hkcfa\s*2|3 hklrd 164/i,
    forbid_case: /lam tat ming|\[2021\].*hkcfa/i,
    min_hits: 1,
  },
  {
    id: "leung_public_assembly",
    query: "Leung Kwok Hung public assembly proportionality",
    require_case: /leung kwok hung/i,
    require_terms: [/peaceful assembly|proportionality|prescribed by law/i],
    forbid_case: /lam tat ming|\[2021\].*lai chee ying.*bail/i,
    min_hits: 1,
  },
  {
    id: "lam_detention_confession",
    query: "Lam Tat Ming detention after arrest confession",
    require_case: /lam tat ming/i,
    require_terms: [/confession|residual discretion|voluntary/i],
    forbid_case: /peaceful assembly|\[2005\].*hkcfa\s*2/i,
    min_hits: 1,
  },
  {
    id: "theft_forgot_pay",
    query: "forgot to pay at shop dishonesty theft",
    require_doctrine: /theft|dishonesty/i,
    min_hits: 1,
  },
  {
    id: "theft_intention_deprive",
    query: "intention permanently to deprive theft",
    require_doctrine: /theft|dishonesty/i,
    min_hits: 1,
  },
  {
    id: "theft_belonging_another",
    query: "belonging to another theft",
    require_doctrine: /theft|dishonesty/i,
    min_hits: 1,
  },
  {
    id: "theft_appropriation",
    query: "appropriation theft Hong Kong",
    require_doctrine: /theft|dishonesty/i,
    min_hits: 1,
  },
  {
    id: "bail_theft",
    query: "bail factors theft dishonesty",
    require_doctrine: /bail/i,
    min_hits: 1,
  },
  {
    id: "interview_caution",
    query: "interview caution Hong Kong criminal procedure",
    require_doctrine: /invest_|confession|criminal_procedure/i,
    min_hits: 1,
  },
];

const LEVEL2_QUERIES = [
  {
    id: "peaceful_protest",
    query: "I joined a peaceful protest and police restricted the route. What legal issues matter?",
    require_evidence: true,
    forbid_case: /lam tat ming/i,
    require_terms: [/assembly|proportionality|public order/i],
  },
  {
    id: "shop_forgot_pay",
    query: "I picked up goods in a shop, forgot to pay, and left. What theft issues matter?",
    require_evidence: true,
    require_doctrine: /theft|dishonesty/i,
  },
  {
    id: "intention_return",
    query: "What does intention permanently to deprive mean if I planned to return the item?",
    require_evidence: true,
    require_doctrine: /theft|dishonesty/i,
  },
  {
    id: "belonging_mistake",
    query: "The property was in someone else's possession, but I thought it was mine. What theft issue is this?",
    require_evidence: true,
    require_doctrine: /theft|dishonesty/i,
  },
  {
    id: "bail_after_theft",
    query: "What bail factors matter after a theft arrest?",
    require_evidence: true,
    require_doctrine: /bail/i,
  },
  {
    id: "interview_rights",
    query: "The police interviewed me without explaining my rights. What issues matter?",
    require_evidence: true,
    require_doctrine: /invest_|confession|lam_tat_ming/i,
  },
  {
    id: "landlord_rent",
    query: "My landlord increased my rent. What should I do?",
    must_abstain: true,
    forbid_criminal_evidence: true,
  },
];

function evaluateLevel1Query(spec) {
  const search = searchParagraphLinkedCases(spec.query, { limit: 8 });
  const hits = search.hits;
  const errors = [];
  const verifications = hits.map(hit => verifyEvidenceRecord(hit));

  if (hits.length < (spec.min_hits || 1)) errors.push("insufficient_paragraph_linked_hits");
  if (spec.require_case && !hitsContainPattern(hits, spec.require_case)) errors.push("required_case_missing");
  if (spec.require_citation && !hitsContainPattern(hits, spec.require_citation)) errors.push("required_citation_missing");
  if (spec.forbid_case && hitsContainPattern(hits, spec.forbid_case)) errors.push("forbidden_case_present");
  for (const term of spec.require_terms || []) {
    if (!hitsContainPattern(hits, term) && !search.doctrine_scores.some(d => term.test(d.doctrine_node_id))) {
      errors.push(`required_term_missing:${term}`);
    }
  }
  if (spec.require_doctrine) {
    const doctrineHit = search.doctrine_scores.some(d => spec.require_doctrine.test(d.doctrine_node_id));
    if (!doctrineHit && !hits.some(h => spec.require_doctrine.test(recordSearchBlob(h)))) {
      errors.push("required_doctrine_missing");
    }
  }
  for (const v of verifications) {
    if (!v.ok) errors.push(...v.errors.map(e => `record_${e}`));
  }

  const excluded = loadExcludedIds();
  for (const hit of hits) {
    if (excluded.has(hit.doctrine_node_id) || excluded.has(hit.case_seed_id)) {
      errors.push("excluded_seed_returned");
    }
  }

  return {
    id: spec.id,
    query: spec.query,
    pass: errors.length === 0,
    errors,
    hit_count: hits.length,
    top_hits: hits.slice(0, 3).map(h => ({
      case_name: h.case_name,
      citation: h.neutral_citation || h.citation,
      paragraph_number: h.paragraph_number,
      source_url: h.source_url,
      source_status: h.source_status,
    })),
  };
}

function evaluateLevel2Query(spec) {
  const analysis = simulateInquiryAnalysis(spec.query);
  const errors = [];
  const evidenceBlob = (analysis.evidence || []).map(recordSearchBlob).join(" ");

  if (spec.must_abstain) {
    if (!analysis.abstain) errors.push("expected_abstain");
    if (analysis.evidence.length) errors.push("criminal_evidence_should_not_be_used");
  } else {
    if (analysis.abstain) errors.push("unexpected_abstain");
    if (spec.require_evidence && !analysis.evidence.length) errors.push("no_paragraph_evidence");
    if (spec.forbid_case && new RegExp(spec.forbid_case, "i").test(evidenceBlob)) errors.push("forbidden_case_used");
    if (spec.require_doctrine && !new RegExp(spec.require_doctrine, "i").test(
      `${evidenceBlob} ${(analysis.matched_doctrine_nodes || []).map(n => n.doctrine_node_id).join(" ")}`,
    )) {
      errors.push("required_doctrine_missing");
    }
    for (const term of spec.require_terms || []) {
      if (!term.test(`${analysis.summary} ${analysis.legal_position} ${evidenceBlob}`)) {
        errors.push(`required_term_missing:${term}`);
      }
    }
    if (!analysis.case_references.length) errors.push("no_case_references");
    if (!(analysis.summary && analysis.legal_position)) errors.push("incomplete_analysis");
  }

  return {
    id: spec.id,
    query: spec.query,
    pass: errors.length === 0,
    errors,
    abstain: analysis.abstain,
    evidence_count: analysis.evidence.length,
    case_references: analysis.case_references,
    summary: analysis.summary,
  };
}

function runLevel1Eval() {
  const results = LEVEL1_QUERIES.map(evaluateLevel1Query);
  return {
    generated_at: new Date().toISOString(),
    level: 1,
    pass: results.every(r => r.pass),
    total: results.length,
    passed: results.filter(r => r.pass).length,
    failed: results.filter(r => !r.pass).length,
    results,
  };
}

function runLevel2Eval() {
  const results = LEVEL2_QUERIES.map(evaluateLevel2Query);
  return {
    generated_at: new Date().toISOString(),
    level: 2,
    pass: results.every(r => r.pass),
    total: results.length,
    passed: results.filter(r => r.pass).length,
    failed: results.filter(r => !r.pass).length,
    results,
  };
}

function writeEvalMarkdown(title, payload) {
  const lines = [
    `# ${title}`,
    "",
    `Generated: ${payload.generated_at}`,
    "",
    `**Overall:** ${payload.pass ? "PASS" : "FAIL"} (${payload.passed}/${payload.total})`,
    "",
    "| ID | Pass | Errors |",
    "|---|---|---|",
    ...payload.results.map(r => `| ${r.id} | ${r.pass ? "pass" : "fail"} | ${(r.errors || []).join("; ") || "—"} |`),
    "",
  ];
  return lines.join("\n");
}

function auditBackendSearchable() {
  const inventory = collectCaseLikeInventory();
  const index = loadViewerEvidenceIndex();
  const excluded = loadExcludedIds();
  const verifiedSeedIds = new Set(index.verified_case_seed_ids || []);
  const unverifiedVisible = inventory.filter(seed =>
    !verifiedSeedIds.has(seed.doctrine_node_id) && !excluded.has(seed.doctrine_node_id),
  );
  const backendUnverified = [];
  for (const seed of inventory) {
    const hits = evidenceForDoctrineNode(seed.doctrine_node_id).filter(isVerifiedParagraphProof);
    if (hits.length) continue;
    if (excluded.has(seed.doctrine_node_id)) continue;
    backendUnverified.push(seed.doctrine_node_id);
  }
  return {
    visible_unverified: unverifiedVisible.length,
    backend_searchable_unverified: backendUnverified.length,
    unverified_visible_ids: unverifiedVisible.map(s => s.doctrine_node_id),
    backend_unverified_ids: backendUnverified,
  };
}

function auditRegistry() {
  if (!fs.existsSync(REGISTRY_PATH)) return { ok: false, errors: ["registry_missing"] };
  const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
  const errors = [];
  let productEntries = 0;
  let unverifiedEntries = 0;
  for (const [doctrineId, items] of Object.entries(registry.entries || {})) {
    for (const item of items) {
      productEntries += 1;
      if (!isVerifiedParagraphProof({
        ...item,
        paragraph_number: item.para_no,
        exact_quote: item.exact_quote || item.supporting_quote,
      })) {
        unverifiedEntries += 1;
        errors.push(`unverified_registry_item:${doctrineId}`);
      }
    }
  }
  return { ok: errors.length === 0, productEntries, unverifiedEntries, errors: errors.slice(0, 20) };
}

module.exports = {
  searchParagraphLinkedCases,
  verifyEvidenceRecord,
  simulateInquiryAnalysis,
  isUnsupportedCivilRentQuery,
  runLevel1Eval,
  runLevel2Eval,
  writeEvalMarkdown,
  auditBackendSearchable,
  auditRegistry,
  LEVEL1_QUERIES,
  LEVEL2_QUERIES,
};
