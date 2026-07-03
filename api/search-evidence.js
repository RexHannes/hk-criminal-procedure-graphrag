const fs = require("fs");
const path = require("path");
const { composeAnswer } = require("../src/api/answer-composers");
const { filterPiChunksByContract } = require("../src/api/answer-composers/pi");
const { findCachedLegalAnswer, writeLegalAnswerCache } = require("../src/api/legal-ingest/cache");
const { localCaseFruitEvidenceForNode } = require("../src/case_graph/local_case_fruit_evidence");
const { attachResearchPrototypeMetadata } = require("../src/case_graph/research_prototype_metadata");
const { verifiedEvidenceForDoctrineNode, isVerifiedParagraphProof } = require("../src/case_graph/verified_case_authority");
const { diversifyEvidence, groupEvidenceByCaseForAnswer } = require("../src/case_graph/retrieval_diversity");
const { composeResearchMemo } = require("../src/case_graph/research_memo_composer");
const { exactJsonHeaders, rejectUnsupportedJsonContentType } = require("../src/api/json_content_type");
const { arbitrateLegalQuery } = require("../src/routing/legal_domain_arbiter");
const {
  assertFreeOpenRouterModel,
  defaultFreeOpenRouterChatModel,
  isOpenRouterFreeOnlyEnabled,
  isOpenRouterPaidAllowed,
  resolveOpenRouterModel,
} = require("../src/retrieval/openrouter_free_only");

const DATA_ROOT = path.join(process.cwd(), "data", "legal_domain_packs", "demo_maps");
const INDEX_PATH = path.join(process.cwd(), "data", "index.json");
const PI_RAG_PATH = path.join(DATA_ROOT, "tort_law_hk", "pi_rag_index.json");
const INCONSISTENT_PLEADINGS_VERTICAL_PATH = path.join(process.cwd(), "data", "legal_ingest", "verticals", "inconsistent_pleadings.json");

const SUPPORT_RELATIONSHIPS = new Set([
  "statutory_anchor",
  "case_seed",
  "practice_direction_ref",
  "cross_reference",
  "listing_rule_anchor",
  "guidance_letter_seed",
  "sehk_decision_seed",
  "practice_note_anchor",
  "enforcement_seed",
  "sfc_material_seed",
]);
const SUPPORT_TYPES = new Set([
  "case_seed",
  "statute",
  "practice_direction",
  "listing_rule",
  "listing_rule_anchor",
  "sehk_decision_seed",
  "guidance_letter_seed",
  "practice_note_anchor",
  "enforcement_seed",
  "sfc_material_seed",
]);
const SAFE_STATUSES = new Set(["human_reviewed", "answer_safe"]);
const VERIFIED_STATUSES = new Set(["paragraph_verified", "source_verified", "human_reviewed", "answer_safe"]);
const PARAGRAPH_PROOF_STATUSES = new Set(["paragraph_verified", "source_verified", "answer_safe"]);
const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "can", "for", "from", "how", "if", "in", "is", "it",
  "of", "on", "or", "the", "to", "what", "when", "where", "which", "who", "why", "with", "does", "do",
  "there", "under", "law", "hk", "hong", "kong",
]);
const VERIFIED_COVERAGE_STATUSES = new Set(["source_verified", "paragraph_verified", "answer_safe"]);

const QUERY_EXPANSIONS = [
  {
    pattern: /\b(hit|crash|crashed|collision|collided|knocked|struck|accident|injur(?:y|ed|ies))\b.*\b(car|vehicle|taxi|bus|lorry|truck|driver|road|traffic|motor)\b|\b(car|vehicle|taxi|bus|lorry|truck|driver|road|traffic|motor)\b.*\b(hit|crash|crashed|collision|collided|knocked|struck|accident|injur(?:y|ed|ies))\b/i,
    terms: ["negligence", "duty of care", "breach", "causation", "damage", "personal injury", "road user", "driver", "traffic accident"],
    preferred_domains: ["tort_law_hk"]
  },
  {
    pattern: /\b(work|worker|employee|employer|workplace|site)\b.*\b(injur(?:y|ed|ies)|accident|unsafe|fall|fell)\b|\b(injur(?:y|ed|ies)|accident|unsafe|fall|fell)\b.*\b(work|worker|employee|employer|workplace|site)\b/i,
    terms: ["employer duty", "vicarious liability", "safe system of work", "personal injury", "negligence", "breach"],
    preferred_domains: ["tort_law_hk"]
  },
  {
    pattern: /\b(slip|slipped|trip|tripped|fall|fell)\b.*\b(shop|mall|premises|building|restaurant|office|stairs|floor)\b|\b(shop|mall|premises|building|restaurant|office|stairs|floor)\b.*\b(slip|slipped|trip|tripped|fall|fell)\b/i,
    terms: ["occupiers liability", "premises", "negligence", "duty of care", "breach", "personal injury"],
    preferred_domains: ["tort_law_hk"]
  },
  {
    pattern: /\b(unlawful assembly|riot|rioting|public order|protest|protestor|protester|harcourt road|black bloc|black clothing|conceal(?:ed|ment)?|masked|hand(?:ed|ing)? water|water to protest|2019)\b/i,
    terms: ["unlawful assembly", "riot", "public order", "joint enterprise", "accessory", "presence", "common purpose", "breach of the peace", "criminal law"],
    preferred_domains: ["criminal_law_hk", "criminal_procedure_hk"]
  },
  {
    pattern: /\b(probate|letters of administration|intestate|executor|administrator|grant of representation|caveat|warning|citation|reseal|resealing|foreign grant|lost will|copy will|swear death|rectification of will|inventory|estate distribution)\b/i,
    terms: ["probate", "grant", "executor", "administrator", "will", "estate", "probate registry", "common form", "contentious probate", "assets liabilities"],
    preferred_domains: ["probate_law_hk"]
  }
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function detectsInconsistentPleadingsQuery(query) {
  const q = String(query || "").toLowerCase();
  return (
    /\b(abuse of process|estoppel|collateral attack|res judicata|henderson)\b/.test(q) ||
    (/\b(inconsistent|contradictory|diametrically opposed|opposite|different version|different versions)\b/.test(q) &&
      /\b(pleading|pleadings|statement|statements|affidavit|affirmation|proceeding|proceedings|case|cases|action|actions)\b/.test(q))
  );
}

function detectsCriminalPublicOrderQuery(query) {
  const q = String(query || "").toLowerCase();
  return (
    /\b(unlawful assembly|riot|rioting|public order|protest|protestor|protester|harcourt road|black bloc|black clothing|conceal(?:ed|ment)?|masked|2019)\b/.test(q) ||
    (/\b(hand(?:ed|ing)?|give|gave|provid(?:e|ed|ing))\b/.test(q) && /\b(water|supplies|helmet|mask|umbrella)\b/.test(q) && /\b(protest|protestor|protester|riot|unlawful assembly)\b/.test(q))
  );
}

function detectsCriminalLawQuery(query) {
  const q = String(query || "").toLowerCase();
  return detectsCriminalPublicOrderQuery(q) || /\b(sedition|seditious|theft|assault|battery|manslaughter|murder|dishonesty|conspiracy|attempt|incitement|joint enterprise|accessory|aiding|abetting)\b/.test(q);
}

function detectsPersonalInjuryPurpose(query) {
  const q = String(query || "").toLowerCase();
  return /\b(personal injury|injur(?:y|ed|ies)|medical|compensation|damages|quantum|fracture|pain|suffering|loss of earnings|hospital|sick leave|accident claim)\b/.test(q);
}

function detectsCriminalLawPriority(query) {
  const arbiter = arbitrateLegalQuery(query);
  return arbiter.selected_domain === "criminal_law" || arbiter.selected_domain === "criminal_procedure";
}

function loadInconsistentPleadingsVertical(query) {
  if (!detectsInconsistentPleadingsQuery(query)) return null;
  if (!fs.existsSync(INCONSISTENT_PLEADINGS_VERTICAL_PATH)) return null;
  try {
    return readJson(INCONSISTENT_PLEADINGS_VERTICAL_PATH);
  } catch (error) {
    return null;
  }
}

function doctrineNodeIdFor(node, domainId) {
  if (node.doctrine_node_id) return node.doctrine_node_id;
  if (node.id && node.id.startsWith(`${domainId}.`)) return node.id;
  return `${domainId}.${node.id}`;
}

function loadGraph() {
  const registry = readJson(INDEX_PATH);
  const nodes = [];
  const nodeById = new Map();
  const parentBySupportId = new Map();

  for (const domain of registry.domains || []) {
    const domainId = domain.domain_id;
    const domainDir = path.join(DATA_ROOT, domain.path.replace(/\/?domain\.json$/, ""));
    const manifestPath = path.join(domainDir, "consolidated.json");
    if (!fs.existsSync(manifestPath)) continue;
    const manifest = readJson(manifestPath);

    for (const section of manifest.sections || []) {
      const nodeFile = path.join(domainDir, section.node_file);
      if (!fs.existsSync(nodeFile)) continue;
      const payload = readJson(nodeFile);
      for (const node of payload.nodes || []) {
        const doctrineNodeId = doctrineNodeIdFor(node, domainId);
        const enriched = {
          ...node,
          domain_id: domainId,
          source_node_id: node.id,
          doctrine_node_id: doctrineNodeId,
          title: node.label || node.id,
          section_title: section.title || section.id || "",
        };
        nodes.push(enriched);
        nodeById.set(node.id, enriched);
        nodeById.set(doctrineNodeId, enriched);
      }
    }

    for (const section of manifest.sections || []) {
      const edgeFile = path.join(domainDir, section.edge_file);
      if (!edgeFile || !fs.existsSync(edgeFile)) continue;
      const payload = readJson(edgeFile);
      for (const edge of payload.edges || []) {
        if (SUPPORT_RELATIONSHIPS.has(edge.relationship) && edge.from && edge.to) {
          parentBySupportId.set(edge.to, edge.from);
        }
      }
    }
  }

  return { nodes, nodeById, parentBySupportId };
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .split(/\s+/)
    .filter(token => token.length > 1 && !STOPWORDS.has(token));
}

function expandQueryText(query) {
  const expansions = [];
  for (const item of QUERY_EXPANSIONS) {
    if (item.pattern.test(query)) expansions.push(...item.terms);
  }
  return [query, ...expansions].join(" ");
}

function queryDomainPreferences(query) {
  const domains = new Set();
  const arbiter = arbitrateLegalQuery(query);
  (arbiter.allowed_static_domains || []).forEach(domainId => domains.add(domainId));
  for (const item of QUERY_EXPANSIONS) {
    if (item.pattern.test(query)) {
      (item.preferred_domains || []).forEach(domainId => domains.add(domainId));
    }
  }
  return domains;
}

function nodeSearchText(node) {
  return [
    node.doctrine_node_id,
    node.id,
    node.title,
    node.summary,
    node.type,
    node.domain_id,
    node.section,
    node.subsection,
    node.subtopic,
    node.section_title,
    node.neutral_citation,
    node.verification_status,
    node.authority_status,
    node.answer_layer_status,
    ...(node.statute_refs || []),
    ...(node.case_seeds || []),
    ...(node.listing_rule_refs || []),
    ...(node.guidance_refs || []),
    ...(node.practice_direction_refs || []),
    ...(node.cross_refs || []),
  ].filter(Boolean).join(" ").toLowerCase();
}

function displayNodeForSearch(node, graph) {
  if (!SUPPORT_TYPES.has(node.type)) return node;
  const parentId = graph.parentBySupportId.get(node.id);
  return parentId ? (graph.nodeById.get(parentId) || node) : node;
}

function deterministicMatches(query, graph, limit = 12) {
  const terms = tokenize(expandQueryText(query));
  const preferredDomains = queryDomainPreferences(query);
  const seen = new Map();
  for (const node of graph.nodes) {
    const text = nodeSearchText(node);
    let score = 0;
    for (const term of terms) {
      if (text.includes(term)) score += 1;
      if (String(node.title || "").toLowerCase().includes(term)) score += 3;
      if (String(node.id || "").toLowerCase().includes(term)) score += 2;
      if ((node.case_seeds || []).some(ref => String(ref).toLowerCase().includes(term))) score += 2;
    }
    if (preferredDomains.size) {
      if (preferredDomains.has(node.domain_id)) score += 2;
      else score -= 4;
    }
    if (!terms.length && node.domain_id === "criminal_procedure_hk") score = 1;
    if (score <= 0) continue;

    const displayNode = displayNodeForSearch(node, graph);
    if (SUPPORT_TYPES.has(displayNode.type)) continue;
    const existing = seen.get(displayNode.doctrine_node_id);
    const matchedVia = node.id === displayNode.id ? [] : [{ id: node.id, label: node.title, type: node.type }];
    if (!existing || score > existing.score) {
      seen.set(displayNode.doctrine_node_id, { node: displayNode, score, matched_via: matchedVia });
    } else if (matchedVia.length) {
      existing.matched_via.push(...matchedVia);
    }
  }

  return Array.from(seen.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(item => ({
      doctrine_node_id: item.node.doctrine_node_id,
      source_node_id: item.node.source_node_id,
      title: item.node.title,
      node_type: item.node.type || "unknown",
      domain_id: item.node.domain_id,
      section: item.node.section || "",
      summary: item.node.summary || "",
      verification_status: item.node.verification_status || "verified",
      answer_layer_status: item.node.answer_layer_status || "paragraph_verified",
      authority_status: item.node.authority_status || "verified_case_linked",
      match_score: item.score,
      matched_via: item.matched_via.slice(0, 4),
    }));
}

function getAiProvider() {
  const preferredProvider = String(process.env.LLM_PROVIDER || process.env.CASE_GRAPH_LLM_PROVIDER || "").trim().toLowerCase();
  const openRouterKey = (process.env.OPENROUTER_API_KEY || "").trim();
  if (openRouterKey && preferredProvider !== "deepseek") {
    const model = resolveOpenRouterModel(process.env, ["OPENROUTER_MODEL"]) || String(process.env.OPENROUTER_MODEL || "").trim();
    try {
      if (model) assertFreeOpenRouterModel(model, process.env, { context: "chat_completions" });
      if (!model) {
        return {
          name: "openrouter",
          disabled: true,
          warnings: ["openrouter_free_model_required"],
        };
      }
      return {
        name: "openrouter",
        apiKey: openRouterKey,
        endpoint: "https://openrouter.ai/api/v1/chat/completions",
        model,
        headers: {
          "HTTP-Referer": "https://hk-criminal-procedure-graphrag.vercel.app",
          "X-Title": "HK Legal Doctrine Evidence Viewer",
        },
      };
    } catch (error) {
      if (isOpenRouterFreeOnlyEnabled(process.env) && !isOpenRouterPaidAllowed(process.env)) {
        return {
          name: "openrouter",
          disabled: true,
          warnings: [error.message],
        };
      }
      throw error;
    }
  }
  const deepSeekKey = (process.env.DEEPSEEK_API_KEY || "").trim();
  if (deepSeekKey) {
    return {
      name: "deepseek",
      apiKey: deepSeekKey,
      endpoint: "https://api.deepseek.com/chat/completions",
      model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
      headers: {},
    };
  }
  return null;
}

async function callAiJson(systemPrompt, userPrompt) {
  const provider = getAiProvider();
  if (!provider) return { provider: "none", status: "not_configured", json: null, warnings: ["ai_provider_not_configured"] };
  if (provider.disabled || provider.status === "blocked_free_model_required" || !provider.endpoint) {
    return {
      provider: provider.name || "none",
      status: provider.status || "disabled",
      json: null,
      warnings: provider.warnings || [`${provider.name || "provider"}_disabled`],
    };
  }
  try {
    const response = await fetch(provider.endpoint, {
      method: "POST",
      headers: exactJsonHeaders({
        Authorization: `Bearer ${provider.apiKey}`,
        ...provider.headers,
      }),
      body: JSON.stringify({
        model: provider.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });
    if (!response.ok) return { provider: provider.name, status: "failed", json: null, warnings: [`${provider.name}_request_failed`] };
    const payload = await response.json();
    const text = payload?.choices?.[0]?.message?.content || "{}";
    return { provider: provider.name, status: "used", json: JSON.parse(text), warnings: [] };
  } catch (error) {
    return { provider: provider.name, status: "failed", json: null, warnings: [`${provider.name}_parse_or_network_failed`] };
  }
}

async function askAiToRank(query, candidates) {
  if (candidates.length === 0) {
    const provider = getAiProvider();
    return { provider: provider?.name || "none", status: "no_candidates", ranked_ids: [], warnings: [] };
  }

  const prompt = [
    "Rank these Hong Kong legal doctrine nodes for the user query.",
    "Return strict JSON only: {\"ranked_ids\":[\"...\"],\"detected_domains\":[\"...\"],\"query_focus\":\"...\",\"warnings\":[]}.",
    "Use only candidate doctrine_node_id values supplied. Do not invent cases, citations, paragraphs, or legal conclusions.",
    "User query:",
    query,
    "Candidate nodes:",
    JSON.stringify(candidates.slice(0, 20).map(c => ({
      doctrine_node_id: c.doctrine_node_id,
      title: c.title,
      node_type: c.node_type,
      domain_id: c.domain_id,
      summary: c.summary,
    }))),
  ].join("\n");

  const ai = await callAiJson(
    "You are a cautious legal ontology router. You rank nodes only; you do not answer legal questions.",
    prompt,
  );
  if (ai.status !== "used" || !ai.json) {
    return { provider: ai.provider, status: ai.status, ranked_ids: [], warnings: ai.warnings };
  }
  try {
    const parsed = ai.json;
    const allowed = new Set(candidates.map(c => c.doctrine_node_id));
    const ranked = Array.isArray(parsed.ranked_ids) ? parsed.ranked_ids.filter(id => allowed.has(id)) : [];
    return {
      status: "used",
      provider: ai.provider,
      ranked_ids: ranked,
      detected_domains: Array.isArray(parsed.detected_domains) ? parsed.detected_domains : [],
      query_focus: parsed.query_focus || "",
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
    };
  } catch (error) {
    return { provider: ai.provider, status: "failed", ranked_ids: [], warnings: ["ai_rank_validation_failed"] };
  }
}

async function askAiToAnalyze(query, matches, evidenceCount) {
  const evidenceBrief = matches.slice(0, 6).map(match => ({
    doctrine_node_id: match.doctrine_node_id,
    title: match.title,
    domain_id: match.domain_id,
    summary: match.summary,
    coverage_status: match.coverage_status,
    evidence: (match.evidence || []).slice(0, 6).map(item => ({
      case_name: item.case_name,
      neutral_citation: item.neutral_citation,
      court_level: item.court_level || item.case_level,
      case_level: item.case_level,
      authority_role: item.authority_role,
      leading_case_cluster: Boolean(item.leading_case_cluster),
      diversity_rank: item.diversity_rank,
      sub_issue_tags: item.sub_issue_tags || [],
      para_no: item.para_no,
      proposition_text: item.proposition_text,
      supporting_quote: item.supporting_quote || item.exact_quote || "",
      paragraph_text: item.paragraph_text,
      source_url: item.source_url,
      verification_status: item.verification_status,
      answer_layer_status: item.answer_layer_status,
      case_note: item.case_note || null,
    })),
  }));

  const prompt = [
    "Analyze the user query using only the supplied doctrine nodes and linked evidence.",
    "Return strict JSON only with this shape:",
    "{\"summary\":\"...\",\"legal_position\":\"...\",\"application\":\"...\",\"node_references\":[{\"doctrine_node_id\":\"...\",\"title\":\"...\",\"role\":\"...\"}],\"case_references\":[{\"case_name\":\"...\",\"neutral_citation\":\"...\",\"para_no\":\"...\",\"status\":\"...\"}],\"warnings\":[],\"abstain\":false}",
    "Rules:",
    "- Do not invent authorities, paragraphs, citations, statutes, or facts.",
    "- node_references must copy doctrine_node_id values from the supplied context exactly.",
    "- case_references must copy case_name, neutral_citation, and para_no from the supplied evidence exactly.",
    "- If evidence is absent, state the limitation clearly.",
    "- Treat supplied paragraph-linked public judgment evidence as quotable research authority.",
    "- Lawyer review is not required for this research prototype; abstain only when no paragraph-linked evidence is supplied.",
    "- Keep the analysis concise and audit-style, not legal advice.",
    "User query:",
    query,
    "Evidence count:",
    String(evidenceCount),
    "Matched graph/evidence context:",
    JSON.stringify(evidenceBrief),
  ].join("\n");

  const ai = await callAiJson(
    "You are a cautious Hong Kong legal research assistant. You produce source-bounded audit summaries only.",
    prompt,
  );
  if (ai.status !== "used" || !ai.json) {
    return {
      provider: ai.provider,
      status: ai.status,
      analysis: null,
      warnings: ai.warnings,
    };
  }
  const parsed = ai.json;
  const validation = validateAiAnalysis(parsed, matches);
  return {
    provider: ai.provider,
    status: "used",
    analysis: validation.analysis,
    warnings: validation.warnings,
  };
}

function normalizedRef(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function evidenceMatchesReference(ref, item) {
  const refCitation = normalizedRef(ref.neutral_citation || ref.citation);
  const refCase = normalizedRef(ref.case_name || ref.title);
  const refPara = normalizedRef(ref.para_no || ref.paragraph || ref.paragraph_no);
  const citationOk = refCitation && refCitation === normalizedRef(item.neutral_citation);
  const caseOk = refCase && refCase === normalizedRef(item.case_name);
  const paraOk = !refPara || refPara === normalizedRef(item.para_no);
  return (citationOk || caseOk) && paraOk;
}

function validateAiAnalysis(parsed, matches) {
  const warnings = [];
  const allowedNodes = new Map(matches.map(match => [match.doctrine_node_id, match]));
  const nodeReferences = [];

  for (const ref of Array.isArray(parsed.node_references) ? parsed.node_references : []) {
    const id = String(ref?.doctrine_node_id || "").trim();
    const match = allowedNodes.get(id);
    if (!match) {
      warnings.push("analysis_node_reference_dropped");
      continue;
    }
    nodeReferences.push({
      doctrine_node_id: match.doctrine_node_id,
      title: match.title,
      role: String(ref.role || "matched_node"),
      coverage_status: match.coverage_status || "no_evidence",
    });
  }

  const evidenceItems = matches.flatMap(match =>
    (match.evidence || []).map(item => ({ ...item, doctrine_node_id: match.doctrine_node_id }))
  );
  const caseReferences = [];
  for (const ref of Array.isArray(parsed.case_references) ? parsed.case_references : []) {
    const item = evidenceItems.find(candidate => evidenceMatchesReference(ref, candidate));
    if (!item) {
      warnings.push("analysis_case_reference_dropped");
      continue;
    }
    caseReferences.push({
      case_name: item.case_name,
      neutral_citation: item.neutral_citation,
      para_no: item.para_no,
      paragraph_id: item.paragraph_id || "",
      proposition_id: item.proposition_id || "",
      proposition_text: item.proposition_text || "",
      supporting_quote: item.supporting_quote || item.exact_quote || "",
      paragraph_text: item.paragraph_text || "",
      source_url: item.source_url || "",
      status: item.answer_layer_status,
      verification_status: item.verification_status,
      doctrine_node_id: item.doctrine_node_id,
      quote_verified: Boolean(item.quote_verified || (item.supporting_quote && item.paragraph_text && item.paragraph_text.includes(item.supporting_quote))),
    });
  }

  const evidenceCount = evidenceItems.length;
  const verifiedEvidenceCount = evidenceItems.filter(item => VERIFIED_COVERAGE_STATUSES.has(item.answer_layer_status)).length;
  let abstain = Boolean(parsed.abstain);
  if (!evidenceCount) {
    warnings.push("analysis_has_no_paragraph_evidence");
    abstain = true;
  } else if (!verifiedEvidenceCount && evidenceCount) {
    warnings.push("analysis_has_unverified_evidence");
  }

  const modelWarnings = Array.isArray(parsed.warnings) ? parsed.warnings.map(item => String(item)) : [];
  return {
    analysis: {
      summary: String(parsed.summary || ""),
      legal_position: String(parsed.legal_position || ""),
      application: String(parsed.application || ""),
      node_references: nodeReferences,
      case_references: caseReferences,
      warnings: Array.from(new Set(modelWarnings.concat(warnings))),
      abstain,
    },
    warnings: Array.from(new Set(warnings)),
  };
}

async function supabaseGet(baseUrl, serviceKey, table, query) {
  const url = new URL(`/rest/v1/${table}`, baseUrl);
  Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Accept: "application/json",
    },
  });
  if (!response.ok) throw new Error(`Supabase ${table} HTTP ${response.status}`);
  return response.json();
}

async function firstSupabaseRow(baseUrl, serviceKey, table, query) {
  const rows = await supabaseGet(baseUrl, serviceKey, table, { ...query, limit: "1" });
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

function filterMatchesByArbiter(matches, arbiter) {
  const blocked = new Set(arbiter?.blocked_static_domains || []);
  if (!blocked.size) return matches;
  const filtered = matches.filter(match => !blocked.has(match.domain_id));
  return filtered.length ? filtered : matches;
}

function hasPublicParagraphProof({ proposition, paragraph, legalCase }) {
  return Boolean(
    (paragraph?.source_url || legalCase?.source_url) &&
    (paragraph?.para_no || proposition?.canonical_para_id) &&
    (paragraph?.text || proposition?.proposition_text || proposition?.candidate_proposition)
  );
}

function evidenceLayerStatus({ proposition, paragraph, legalCase, quoteVerified }) {
  if (quoteVerified && hasPublicParagraphProof({ proposition, paragraph, legalCase })) return "paragraph_verified";
  return "no_paragraph_proof";
}

function cleanEvidenceItem({ link, proposition, paragraph, legalCase }) {
  const reviewStatus = link.review_status || proposition.review_status || "machine_candidate";
  const supportingQuote = proposition.supporting_quote || proposition.exact_quote || "";
  const paragraphText = paragraph?.text || "";
  const quoteVerified = Boolean(supportingQuote && paragraphText && paragraphText.includes(supportingQuote));
  const answerLayerStatus = evidenceLayerStatus({ proposition, paragraph, legalCase, quoteVerified });
  return attachResearchPrototypeMetadata({
    case_name: legalCase?.title_en || legalCase?.case_name || "",
    neutral_citation: legalCase?.neutral_citation || "",
    court_level: legalCase?.court_level || "",
    case_id: legalCase?.id || proposition.case_id || "",
    paragraph_id: paragraph?.id || proposition.canonical_para_id || "",
    para_no: paragraph?.para_no || "",
    proposition_id: proposition.id || link.proposition_id || "",
    proposition_text: proposition.proposition_text || proposition.candidate_proposition || "",
    supporting_quote: supportingQuote,
    exact_quote: supportingQuote,
    paragraph_text: paragraphText,
    source_url: paragraph?.source_url || legalCase?.source_url || "",
    link_type: link.link_type || "candidate",
    authority_role: link.link_type || "candidate",
    verification_status: reviewStatus,
    source_verification_status: PARAGRAPH_PROOF_STATUSES.has(answerLayerStatus)
      ? "public_paragraph_linked"
      : reviewStatus,
    public_source_link_verified: PARAGRAPH_PROOF_STATUSES.has(answerLayerStatus),
    answer_layer_status: answerLayerStatus,
    quote_verified: quoteVerified,
    validator_flags: [],
  });
}

async function evidenceForNode(baseUrl, serviceKey, doctrineNodeId) {
  const links = await supabaseGet(baseUrl, serviceKey, "proposition_node_links", {
    doctrine_node_id: `eq.${doctrineNodeId}`,
    select: "id,proposition_id,link_type,confidence,review_status,linking_method",
    order: "confidence.desc",
    limit: "12",
  });
  const evidence = [];
  for (const link of links || []) {
    const proposition = await firstSupabaseRow(baseUrl, serviceKey, "proposition_cards", {
      id: `eq.${link.proposition_id}`,
      select: "id,case_id,canonical_para_id,proposition_text,supporting_quote,proposition_type,issue_tags,doctrine_tags,review_status,confidence",
    });
    if (!proposition) continue;
    const [paragraph, legalCase] = await Promise.all([
      proposition.canonical_para_id
        ? firstSupabaseRow(baseUrl, serviceKey, "legal_paragraphs", {
            id: `eq.${proposition.canonical_para_id}`,
            select: "id,case_id,para_no,text,role_label,source_url,review_status",
          })
        : Promise.resolve(null),
      proposition.case_id
        ? firstSupabaseRow(baseUrl, serviceKey, "legal_cases", {
            id: `eq.${proposition.case_id}`,
            select: "id,title_en,neutral_citation,court_level,court,judgment_date,source_url",
          })
        : Promise.resolve(null),
    ]);
    evidence.push(cleanEvidenceItem({ link, proposition, paragraph, legalCase }));
  }
  return evidence.filter(item => item.answer_layer_status === "paragraph_verified" && item.quote_verified);
}

function coverageForEvidence(evidence) {
  if (evidence.some(item => PARAGRAPH_PROOF_STATUSES.has(item.answer_layer_status))) return "paragraph_verified";
  return "no_evidence";
}

function hasLocalPublicParagraphProof(item) {
  return Boolean(item?.source_url && item?.para_no && (item?.paragraph_text || item?.supporting_quote || item?.proposition_text));
}

function localEvidenceFallbackForNode(doctrineNodeId) {
  return verifiedEvidenceForDoctrineNode(doctrineNodeId).filter(isVerifiedParagraphProof);
}

function warningsForResult(matches, aiStatus, backendStatus, legalSourceCardCount = 0) {
  const warnings = [];
  if (aiStatus !== "used") warnings.push(aiStatus === "not_configured" ? "ai_not_configured_fallback_search" : "ai_ranking_unavailable");
  if (backendStatus !== "connected") warnings.push("backend_evidence_unavailable");
  if (!matches.some(m => m.evidence && m.evidence.length) && !legalSourceCardCount) warnings.push("no_paragraph_proof");
  return Array.from(new Set(warnings));
}

function piRagIndex() {
  if (!fs.existsSync(PI_RAG_PATH)) return null;
  try {
    return readJson(PI_RAG_PATH);
  } catch (error) {
    return null;
  }
}

function piTokens(text) {
  return String(text || "").toLowerCase().split(/[^a-z0-9]+/).filter(token => token.length >= 2);
}

function detectPiRoutes(query) {
  const q = String(query || "").toLowerCase();
  const routes = new Set();
  const hasAny = terms => terms.some(term => q.includes(term));
  if (detectsCriminalPublicOrderQuery(q) && !detectsPersonalInjuryPurpose(q)) return routes;
  if (hasAny(["personal injury", "injury", "injured", "slip", "slipped", "trip", "fall", "fell", "restaurant", "mall", "premises", "wet floor", "water", "cctv", "mopped", "workplace", "worker", "construction site", "scaffold", "stacked materials", "road traffic", "vehicle", "driver", "fatal accident", "dependency", "deceased", "car", "crash", "crashed", "hit by car", "knocked down", "road", "street", "pedestrian", "crossing", "zebra", "traffic light", "red light", "green light", "no white lines", "no zebra crossing"])) routes.add("pi");
  if (hasAny(["restaurant", "mall", "premises", "shop", "wet floor", "water", "mopped", "slip", "slipped", "trip", "fall", "fell"])) routes.add("premises");
  if (hasAny(["form", "writ", "draft", "template", "statement of claim", "schedule of damages"])) routes.add("forms");
  if (hasAny(["procedure", "steps", "sop", "checklist", "pre-action", "discovery", "settlement", "offer", "trial", "what should i do", "consecutively", "next steps", "step by step", "after accident"])) routes.add("procedure");
  if (hasAny(["law", "test", "element", "defence", "duty", "breach", "causation", "quantum", "damages", "compensation", "limitation"])) routes.add("principles");
  if (hasAny(["workplace", "worker", "employee", "employer", "work injury", "work accident", "injured at work", "at work", "construction site", "site", "scaffold", "stacked materials", "industrial", "occupational disease"])) routes.add("workplace");
  if (hasAny(["court", "forum", "jurisdiction", "cfi", "district court", "small claims", "claim value", "hk$", "3m", "3 million"])) routes.add("court_band");
  if (hasAny(["car", "vehicle", "driver", "bus", "taxi", "lorry", "road", "street", "traffic", "collision", "crash", "crashed", "hit by car", "knocked down", "pedestrian", "passenger", "crossing", "zebra", "traffic light", "red light", "green light", "no white lines", "no zebra crossing"])) routes.add("traffic");
  return routes;
}

function composerDomainForQuery(query, matched, piWorkflow) {
  const arbiter = arbitrateLegalQuery(query);
  if (arbiter.selected_domain === "criminal_law") return "criminal_law";
  if (arbiter.selected_domain === "criminal_procedure") return "criminal_procedure";
  if (arbiter.selected_domain === "personal_injury" && piWorkflow) return "personal_injury";
  if (arbiter.selected_domain === "company_forms") return "company_forms";
  if (piWorkflow) return "personal_injury";
  const q = String(query || "").toLowerCase();
  const domains = new Set((matched || []).map(item => item.domain_id).filter(Boolean));
  if (detectsInconsistentPleadingsQuery(q)) return "generic";
  if (domains.has("criminal_law_hk") || /\b(unlawful assembly|riot|sedition|public order|protest|protestor|protester)\b/.test(q)) {
    return "criminal_law";
  }
  if (detectsCriminalLawQuery(q) || domains.has("criminal_law_hk")) return "criminal_law";
  if (
    domains.has("probate_law_hk") ||
    /\b(probate|letters of administration|intestate|executor|administrator|estate|will|codicil|caveat|warning|citation|reseal|resealing|foreign grant|grant of representation|inventory|grant pending suit|ad colligenda|lost will|swear death|rectification of will)\b/.test(q)
  ) return "probate";
  if (
    /\b(company|listing|listed|sehk|sfc|winding[- ]?up|statutory demand|petition|insolvency|incorporation|director|shareholder|board|form|filing)\b/.test(q) ||
    domains.has("hk_listing_and_listed_company_regulation")
  ) return "company_forms";
  if (
    domains.has("criminal_procedure_hk") ||
    /\b(arrest|bail|charge|plea|mention|search warrant|seizure|police|magistrate|appeal|review)\b/.test(q)
  ) return "criminal_procedure";
  return "generic";
}

function scorePiChunk(terms, chunk) {
  const counts = chunk.tokens || {};
  return terms.reduce((sum, term) => sum + (counts[term] ? 1 + Math.log1p(counts[term]) : 0), 0);
}

function piRouteAdjustment(chunk, routes, query) {
  const meta = chunk.metadata || {};
  const blob = [
    chunk.chunk_id, chunk.layer, chunk.title, chunk.source_file, chunk.citation, chunk.pinpoint,
    ...(meta.trigger_conditions || []),
    ...(meta.linked_procedure_nodes || []),
    ...(meta.required_facts || []),
  ].join(" ").toLowerCase();
  let boost = 0;
  if (routes.has("principles") && chunk.layer === "principles") boost += 2;
  if (routes.has("procedure") && chunk.layer === "procedures_forms") boost += 2;
  if (routes.has("forms") && /form|writ|template|statement of claim|schedule/.test(blob)) boost += 3;
  if (routes.has("premises") && /occupier|occupiers|premises|restaurant|mall|wet floor|slip|warning|cleaning|inspection|cctv|water/.test(blob)) boost += 8;
  if (routes.has("premises") && !/\b(hot|scald|burn)\b/i.test(query) && /hot water|scald|burn/.test(blob)) boost -= 12;
  if (routes.has("premises") && !/\b(child|minor|student|school|allurement)\b/i.test(query) && /child|minor|school|allurement|supervision/.test(blob)) boost -= 8;
  if (!routes.has("workplace") && /safe plant|workplace|employer|employee|employees' compensation|occupational|industrial accident/.test(blob)) boost -= 10;
  if (!routes.has("traffic") && /road traffic|rta|driver duty|pedestrian|passenger|vehicle|seatbelt/.test(blob)) boost -= 10;
  if (!/\b(fatal|death|deceased|dependency|estate)\b/i.test(query) && /fatal|deceased|dependency|estate claim/.test(blob)) boost -= 8;
  if (!/\b(psychiatric|shock|ptsd|secondary victim)\b/i.test(query) && /psychiatric|secondary victim|nervous shock/.test(blob)) boost -= 8;
  if (routes.has("workplace") && /workplace|employer|employee|eco_form|employees' compensation|occupational/.test(blob)) boost += 8;
  if (routes.has("traffic") && /road|traffic|rta|driver|vehicle|pedestrian|passenger/.test(blob)) boost += 6;
  if (!routes.has("traffic") && /road traffic|rta|driver duty|pedestrian|seatbelt/.test(blob)) boost -= 10;
  if (routes.has("court_band") && /forum_jurisdiction|court_band|district court|cfi|small claims|dc_writ|cfi_writ/.test(blob)) boost += 8;
  if (String(query || "").toLowerCase().includes("district court") && /dc_writ|district court/.test(blob)) boost += 8;
  return boost;
}

function summarizePiChunk(chunk) {
  const meta = chunk.metadata || {};
  return {
    title: chunk.title,
    source: chunk.source_file,
    citation: chunk.citation,
    pinpoint: chunk.pinpoint,
    quote: chunk.quote,
    required_facts: meta.required_facts || [],
    trigger_conditions: meta.trigger_conditions || [],
    review_status: chunk.review_status || meta.review_status || meta.human_review_status || "unreviewed",
    output_mode: chunk.output_mode || meta.output_mode || "draft_only_lawyer_review_required",
    score: Number(chunk.score || 0),
  };
}

function retrievePiRag(query, limit = 24, minScore = 2) {
  const index = piRagIndex();
  const routes = detectPiRoutes(query);
  if (!index || !routes.has("pi")) return null;
  const terms = piTokens(query);
  const chunks = (index.chunks || [])
    .map(chunk => ({ ...chunk, score: scorePiChunk(terms, chunk) + piRouteAdjustment(chunk, routes, query) }))
    .filter(chunk => chunk.score >= minScore)
    .sort((a, b) => b.score - a.score || String(a.title).localeCompare(String(b.title)))
    .slice(0, limit);
  return { index, routes, chunks };
}

function inferredMissingFacts(query, chunks) {
  const q = String(query || "").toLowerCase();
  const seen = new Set();
  const out = [];
  const add = fact => {
    if (!fact || seen.has(fact)) return;
    seen.add(fact);
    out.push(fact);
  };
  chunks.slice(0, 10).forEach(chunk => (chunk.metadata?.required_facts || []).forEach(add));
  [
    "whether the customer was injured",
    "medical report / diagnosis",
    "incident report",
    "CCTV preservation and timestamp",
    "when the floor was mopped",
    "whether warning signs or barriers were used",
    "cleaning / inspection log",
    "staff and customer witness details",
    "insurance notification / policy details",
    "losses claimed by the customer",
  ].forEach(fact => {
    const keywords = fact.split(/[^a-z0-9]+/i).filter(word => word.length > 4);
    if (!keywords.some(word => q.includes(word.toLowerCase()))) add(fact);
  });
  return out.slice(0, 14);
}

function buildPiWorkflow(query) {
  if (detectsCriminalLawPriority(query)) return null;
  const result = retrievePiRag(query);
  if (!result) return null;
  const { routes, chunks } = result;
  const owner = /\b(owner|restaurant owner|occupier|defendant|insurer)\b/i.test(query);
  const composed = composeAnswer({ domain: "personal_injury", query, routes });
  const classification = composed.classification;
  const appliedTriage = composed.applied_answer;
  const answerContract = composed.answer_contract;
  const filterContract = composed.filter_contract || composed.answer_contract;
  const workflowSupport = composed.workflow_support || {};
  const contractChunks = filterPiChunksByContract(chunks, filterContract);
  const principles = contractChunks.filter(chunk => chunk.layer === "principles").slice(0, 6).map(summarizePiChunk);
  const proceduresForms = contractChunks.filter(chunk => chunk.layer === "procedures_forms").slice(0, 8).map(summarizePiChunk);
  const verification = contractChunks.filter(chunk => chunk.layer === "governance").slice(0, 5).map(summarizePiChunk);
  const missing = workflowSupport.missing_information || inferredMissingFacts(query, contractChunks);
  const neutralExcluded = answerContract?.excluded_issues || [];
  return {
    enabled: true,
    status: chunks.length ? "retrieved" : "abstain_no_pi_source_match",
    routes: Array.from(routes).sort(),
    matter_view: owner ? "potential occupier / defendant-side triage" : "personal injury triage",
    answer_note: "PI workflow output is metadata/source-gated. It is research-only, not legal advice, and stays draft-only until source verification and lawyer review.",
    classification,
    answer_contract: answerContract,
    applied_answer: appliedTriage,
    applied_triage: appliedTriage,
    source_audit: composed.source_audit,
    principles,
    procedures_forms: proceduresForms,
    evidence_plan: workflowSupport.evidence_plan || [],
    quantum_and_consequences: workflowSupport.quantum_and_consequences || [],
    next_procedure_steps: workflowSupport.next_procedure_steps || [],
    missing_information: missing,
    excluded_as_irrelevant: neutralExcluded,
    verification,
    raw_chunk_count: chunks.length,
    contract_chunk_count: contractChunks.length,
    review_status: "draft_only_lawyer_review_required",
  };
}

function postFilterMatchesForQuery(query, matches) {
  const arbiter = arbitrateLegalQuery(query);
  if ((arbiter.allowed_static_domains || []).length || (arbiter.blocked_static_domains || []).length) {
    let filtered = matches.filter(match => {
      if ((arbiter.blocked_static_domains || []).includes(match.domain_id)) return false;
      if ((arbiter.allowed_static_domains || []).length) return arbiter.allowed_static_domains.includes(match.domain_id);
      return true;
    });
    if (!filtered.length && arbiter.selected_domain !== "generic") {
      filtered = matches.filter(match => !(arbiter.blocked_static_domains || []).includes(match.domain_id));
    }
    if (filtered.length) return filtered.slice(0, 8);
  }
  if (detectsCriminalPublicOrderQuery(query) && !detectsPersonalInjuryPurpose(query)) {
    const criminal = matches.filter(match => {
      const blob = [match.domain_id, match.doctrine_node_id, match.title, match.summary].join(" ").toLowerCase();
      return (
        match.domain_id === "criminal_law_hk" ||
        match.domain_id === "criminal_procedure_hk" ||
        /public_order|unlawful assembly|riot|joint enterprise|accessory|presence|common purpose|criminal/.test(blob)
      );
    });
    return (criminal.length ? criminal : matches)
      .filter(match => match.domain_id !== "tort_law_hk")
      .slice(0, 8);
  }
  const routes = detectPiRoutes(query);
  if (!routes.has("pi")) return matches;
  let filtered = matches;
  if (!routes.has("traffic")) {
    filtered = filtered.filter(match => {
      const blob = [match.doctrine_node_id, match.title, match.summary].join(" ").toLowerCase();
      return !/\.rta\.|road traffic|driver duty|pedestrian|seatbelt/.test(blob);
    });
  }
  if (routes.has("premises") && !/\b(nuisance|rylands|statutory duty|escape|dangerous thing)\b/i.test(query)) {
    filtered = filtered.filter(match => {
      const blob = [match.doctrine_node_id, match.title, match.summary].join(" ").toLowerCase();
      return !/rylands|nuisance|breach of statutory duty as tort|strict liability/.test(blob);
    });
  }
  const issueLike = filtered.filter(match => ["legal_issue", "pi_principle"].includes(match.node_type));
  if (issueLike.length >= 3) filtered = issueLike;
  else {
    const nonFlow = filtered.filter(match => match.node_type !== "flow_step" && match.node_type !== "section_header");
    if (nonFlow.length >= 4) filtered = nonFlow;
  }
  if (!filtered.length) filtered = matches;
  return filtered.slice(0, 6);
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  if (rejectUnsupportedJsonContentType(req, res)) return;

  const query = String(req.method === "POST" ? req.body?.query || "" : req.query.q || req.query.query || "").trim();
  if (!query) {
    res.status(400).json({ error: "missing_query" });
    return;
  }

  const graph = loadGraph();
  const arbiter = arbitrateLegalQuery(query);
  const deterministic = deterministicMatches(query, graph, 14);
  const ai = await askAiToRank(query, deterministic);
  let matched = deterministic;
  if (ai.ranked_ids && ai.ranked_ids.length) {
    const byId = new Map(deterministic.map(item => [item.doctrine_node_id, item]));
    matched = ai.ranked_ids.map(id => byId.get(id)).filter(Boolean);
    deterministic.forEach(item => { if (!ai.ranked_ids.includes(item.doctrine_node_id)) matched.push(item); });
  }
  const piWorkflow = buildPiWorkflow(query);
  const legalIngestBundle = loadInconsistentPleadingsVertical(query);
  const legalAnswerCache = legalIngestBundle
    ? await findCachedLegalAnswer({ query, legalIngestBundle })
    : { status: "skipped_no_legal_ingest_bundle" };
  matched = filterMatchesByArbiter(postFilterMatchesForQuery(query, matched), arbiter).slice(0, 8);

  const supabaseUrl = (process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  let backendStatus = supabaseUrl && serviceKey ? "connected" : "not_configured";
  if (supabaseUrl && serviceKey) {
    try {
      for (const match of matched) {
        match.evidence = await evidenceForNode(supabaseUrl, serviceKey, match.doctrine_node_id);
        if (!match.evidence.length) match.evidence = localEvidenceFallbackForNode(match.doctrine_node_id);
        match.coverage_status = coverageForEvidence(match.evidence);
      }
    } catch (error) {
      backendStatus = "query_failed";
      matched.forEach(match => {
        match.evidence = localEvidenceFallbackForNode(match.doctrine_node_id);
        match.coverage_status = coverageForEvidence(match.evidence);
      });
    }
  } else {
    matched.forEach(match => {
      match.evidence = localEvidenceFallbackForNode(match.doctrine_node_id);
      match.coverage_status = coverageForEvidence(match.evidence);
    });
  }

  // Retrieval diversity: annotate every item with issue/authority/case-level
  // metadata + structured case notes, rank distinct cases before repeat
  // paragraphs from the same case, and expose case-grouped authorities.
  for (const match of matched) {
    match.evidence = diversifyEvidence(match.evidence || [], { query });
    match.case_authorities = groupEvidenceByCaseForAnswer(match.evidence, { query });
  }

  const graphEvidenceCount = matched.reduce((sum, item) => sum + (item.evidence || []).length, 0);
  const legalSourceCardCount = legalIngestBundle ? (legalIngestBundle.proposition_cards || []).length : 0;
  const totalEvidenceCount = graphEvidenceCount + legalSourceCardCount;
  const inquiry = piWorkflow && graphEvidenceCount === 0
    ? {
        provider: ai.provider || getAiProvider()?.name || "none",
        status: "skipped_pi_workflow",
        analysis: null,
        warnings: ["pi_workflow_used_no_freeform_analysis"],
      }
    : legalSourceCardCount
      ? {
          provider: ai.provider || getAiProvider()?.name || "none",
          status: "skipped_legal_ingest_professional_answer",
          analysis: null,
          warnings: ["legal_ingest_professional_answer_used_no_freeform_graph_analysis"],
        }
      : await askAiToAnalyze(query, matched, graphEvidenceCount);
  const aiWarnings = []
    .concat(ai.warnings || [])
    .concat(inquiry.warnings || [])
    .concat(inquiry.analysis?.warnings || []);
  const applied = piWorkflow
    ? {
        applied_answer: piWorkflow.applied_answer,
        answer_contract: piWorkflow.answer_contract,
        classification: piWorkflow.classification,
        source_audit: piWorkflow.source_audit,
      }
    : legalAnswerCache.status === "hit" && legalAnswerCache.answer_json
      ? legalAnswerCache.answer_json
      : composeAnswer({ domain: composerDomainForQuery(query, matched, piWorkflow), query, matched, legalIngestBundle });
  const responsePayload = {
    query,
    ai_status: ai.status,
    ai_provider: ai.provider || inquiry.provider || "none",
    analysis_status: inquiry.status,
    ai_query_focus: ai.query_focus || "",
    backend_status: backendStatus,
    arbiter_trace: arbiter,
    detected_domains: ai.detected_domains && ai.detected_domains.length
      ? ai.detected_domains
      : Array.from(new Set(matched.map(item => item.domain_id))),
    applied_answer: applied.applied_answer,
    answer_contract: applied.answer_contract,
    classification: applied.classification,
    source_backed_rules: applied.source_backed_rules || [],
    form_candidates: applied.form_candidates || [],
    unsupported_claims: applied.unsupported_claims || [],
    source_audit: applied.source_audit,
    legal_answer_cache: {
      status: legalAnswerCache.status,
      answer_id: legalAnswerCache.ids?.answerId,
      bundle_id: legalAnswerCache.ids?.bundleId,
      answer_status: legalAnswerCache.answer_status,
      review_status: legalAnswerCache.review_status,
      warning: legalAnswerCache.warning,
    },
    legal_ingest_vertical: legalIngestBundle ? {
      vertical_id: legalIngestBundle.vertical_id,
      status: legalIngestBundle.status,
      source_count: (legalIngestBundle.source_registry || []).length,
      proposition_count: (legalIngestBundle.proposition_cards || []).length,
      form_count: (legalIngestBundle.form_metadata || []).length,
    } : null,
    pi_workflow: piWorkflow,
    matched_doctrine_nodes: matched,
    evidence_count: totalEvidenceCount,
    graph_evidence_count: graphEvidenceCount,
    legal_source_card_count: legalSourceCardCount,
    answer_confidence: totalEvidenceCount > 0 ? "medium" : "low",
    warnings: Array.from(new Set(warningsForResult(matched, ai.status, backendStatus, legalSourceCardCount).concat(aiWarnings))),
    inquiry_analysis: inquiry.analysis,
    research_memo: (() => {
      try { return composeResearchMemo(query); } catch (error) { return null; }
    })(),
    answer_mode: "research_prototype",
    professional_advice_certified: false,
    lawyer_review_status: "unreviewed",
    source_status: "paragraph_linked_public_source",
    research_use_allowed: true,
    answer_note: "Research prototype: paragraph-linked public judgments are retrieved, quoted, and applied for analysis. Not professional legal advice.",
  };
  if (legalIngestBundle) {
    const cacheWrite = await writeLegalAnswerCache({ query, legalIngestBundle, applied, responsePayload });
    responsePayload.legal_answer_cache = {
      ...responsePayload.legal_answer_cache,
      write_status: cacheWrite.status,
      answer_id: cacheWrite.answer_id || responsePayload.legal_answer_cache.answer_id,
      bundle_id: cacheWrite.bundle_id || responsePayload.legal_answer_cache.bundle_id,
      playbook_id: cacheWrite.playbook_id || responsePayload.legal_answer_cache.playbook_id,
      answer_status: cacheWrite.answer_status || responsePayload.legal_answer_cache.answer_status,
      review_status: cacheWrite.review_status || responsePayload.legal_answer_cache.review_status,
      write_warning: cacheWrite.warning,
    };
    if (cacheWrite.warning) responsePayload.warnings.push(`legal_answer_cache_${cacheWrite.status}`);
  }
  res.status(200).json(responsePayload);
};
