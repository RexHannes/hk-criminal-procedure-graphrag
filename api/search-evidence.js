const fs = require("fs");
const path = require("path");

const DATA_ROOT = path.join(process.cwd(), "data", "legal_domain_packs", "demo_maps");
const INDEX_PATH = path.join(process.cwd(), "data", "index.json");

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
const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "can", "for", "from", "how", "if", "in", "is", "it",
  "of", "on", "or", "the", "to", "what", "when", "where", "which", "who", "why", "with", "does", "do",
  "there", "under", "law", "hk", "hong", "kong",
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
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
  const terms = tokenize(query);
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
    if (!terms.length && node.domain_id === "criminal_procedure_hk") score = 1;
    if (!score) continue;

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
      verification_status: item.node.verification_status || "needs_hklii_verification",
      answer_layer_status: item.node.answer_layer_status || "not_product_answer_layer",
      authority_status: item.node.authority_status || "unverified_case_seed",
      match_score: item.score,
      matched_via: item.matched_via.slice(0, 4),
    }));
}

function getAiProvider() {
  const openRouterKey = (process.env.OPENROUTER_API_KEY || "").trim();
  if (openRouterKey) {
    return {
      name: "openrouter",
      apiKey: openRouterKey,
      endpoint: "https://openrouter.ai/api/v1/chat/completions",
      model: process.env.OPENROUTER_MODEL || "openrouter/auto",
      headers: {
        "HTTP-Referer": "https://hk-criminal-procedure-graphrag.vercel.app",
        "X-Title": "HK Legal Doctrine Evidence Viewer",
      },
    };
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
  try {
    const response = await fetch(provider.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        "Content-Type": "application/json",
        ...provider.headers,
      },
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
    evidence: (match.evidence || []).slice(0, 4).map(item => ({
      case_name: item.case_name,
      neutral_citation: item.neutral_citation,
      court_level: item.court_level,
      para_no: item.para_no,
      proposition_text: item.proposition_text,
      paragraph_text: item.paragraph_text,
      verification_status: item.verification_status,
      answer_layer_status: item.answer_layer_status,
    })),
  }));

  const prompt = [
    "Analyze the user query using only the supplied doctrine nodes and linked evidence.",
    "Return strict JSON only with this shape:",
    "{\"summary\":\"...\",\"legal_position\":\"...\",\"application\":\"...\",\"node_references\":[{\"doctrine_node_id\":\"...\",\"title\":\"...\",\"role\":\"...\"}],\"case_references\":[{\"case_name\":\"...\",\"neutral_citation\":\"...\",\"para_no\":\"...\",\"status\":\"...\"}],\"warnings\":[],\"abstain\":false}",
    "Rules:",
    "- Do not invent authorities, paragraphs, citations, statutes, or facts.",
    "- If evidence is absent or only candidate_only, state the limitation clearly.",
    "- Do not call anything answer-safe unless supplied evidence says answer_safe or human_reviewed.",
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
  return {
    provider: ai.provider,
    status: "used",
    analysis: {
      summary: String(parsed.summary || ""),
      legal_position: String(parsed.legal_position || ""),
      application: String(parsed.application || ""),
      node_references: Array.isArray(parsed.node_references) ? parsed.node_references : [],
      case_references: Array.isArray(parsed.case_references) ? parsed.case_references : [],
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
      abstain: Boolean(parsed.abstain),
    },
    warnings: [],
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

function cleanEvidenceItem({ link, proposition, paragraph, legalCase }) {
  const reviewStatus = link.review_status || proposition.review_status || "machine_candidate";
  return {
    case_name: legalCase?.title_en || legalCase?.case_name || "",
    neutral_citation: legalCase?.neutral_citation || "",
    court_level: legalCase?.court_level || "",
    case_id: legalCase?.id || proposition.case_id || "",
    paragraph_id: paragraph?.id || proposition.canonical_para_id || "",
    para_no: paragraph?.para_no || "",
    proposition_id: proposition.id || link.proposition_id || "",
    proposition_text: proposition.proposition_text || proposition.candidate_proposition || "",
    supporting_quote: proposition.supporting_quote || "",
    paragraph_text: paragraph?.text || "",
    source_url: paragraph?.source_url || legalCase?.source_url || "",
    link_type: link.link_type || "candidate",
    authority_role: link.link_type || "candidate",
    verification_status: reviewStatus,
    answer_layer_status: SAFE_STATUSES.has(reviewStatus)
      ? "answer_safe"
      : VERIFIED_STATUSES.has(reviewStatus)
        ? "paragraph_verified"
        : "candidate_only",
    human_review_status: reviewStatus === "human_reviewed" || reviewStatus === "answer_safe" ? "reviewed" : "unreviewed",
    validator_flags: [],
  };
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
      select: "id,case_id,canonical_para_id,proposition_text,proposition_type,issue_tags,doctrine_tags,review_status,confidence",
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
  return evidence;
}

function coverageForEvidence(evidence) {
  if (evidence.some(item => item.answer_layer_status === "answer_safe")) return "answer_safe";
  if (evidence.some(item => item.answer_layer_status === "paragraph_verified")) return "paragraph_verified";
  if (evidence.length) return "candidate_only";
  return "no_evidence";
}

function warningsForResult(matches, aiStatus, backendStatus) {
  const warnings = [];
  if (aiStatus !== "used") warnings.push(aiStatus === "not_configured" ? "ai_not_configured_fallback_search" : "ai_ranking_unavailable");
  if (backendStatus !== "connected") warnings.push("backend_evidence_unavailable");
  if (!matches.some(m => m.evidence && m.evidence.length)) warnings.push("no_verified_paragraph_proof", "insufficient_authority");
  if (matches.some(m => (m.evidence || []).some(e => e.answer_layer_status === "candidate_only"))) warnings.push("candidate_only", "needs_human_review");
  return Array.from(new Set(warnings));
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const query = String(req.method === "POST" ? req.body?.query || "" : req.query.q || req.query.query || "").trim();
  if (!query) {
    res.status(400).json({ error: "missing_query" });
    return;
  }

  const graph = loadGraph();
  const deterministic = deterministicMatches(query, graph, 14);
  const ai = await askAiToRank(query, deterministic);
  let matched = deterministic;
  if (ai.ranked_ids && ai.ranked_ids.length) {
    const byId = new Map(deterministic.map(item => [item.doctrine_node_id, item]));
    matched = ai.ranked_ids.map(id => byId.get(id)).filter(Boolean);
    deterministic.forEach(item => { if (!ai.ranked_ids.includes(item.doctrine_node_id)) matched.push(item); });
  }
  matched = matched.slice(0, 8);

  const supabaseUrl = (process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  let backendStatus = supabaseUrl && serviceKey ? "connected" : "not_configured";
  if (supabaseUrl && serviceKey) {
    try {
      for (const match of matched) {
        match.evidence = await evidenceForNode(supabaseUrl, serviceKey, match.doctrine_node_id);
        match.coverage_status = coverageForEvidence(match.evidence);
      }
    } catch (error) {
      backendStatus = "query_failed";
      matched.forEach(match => {
        match.evidence = [];
        match.coverage_status = "no_evidence";
      });
    }
  } else {
    matched.forEach(match => {
      match.evidence = [];
      match.coverage_status = "no_evidence";
    });
  }

  const evidenceCount = matched.reduce((sum, item) => sum + (item.evidence || []).length, 0);
  const inquiry = await askAiToAnalyze(query, matched, evidenceCount);
  const aiWarnings = []
    .concat(ai.warnings || [])
    .concat(inquiry.warnings || [])
    .concat(inquiry.analysis?.warnings || []);
  res.status(200).json({
    query,
    ai_status: ai.status,
    ai_provider: ai.provider || inquiry.provider || "none",
    analysis_status: inquiry.status,
    ai_query_focus: ai.query_focus || "",
    backend_status: backendStatus,
    detected_domains: ai.detected_domains && ai.detected_domains.length
      ? ai.detected_domains
      : Array.from(new Set(matched.map(item => item.domain_id))),
    matched_doctrine_nodes: matched,
    evidence_count: evidenceCount,
    answer_confidence: evidenceCount > 0 && !matched.some(m => (m.evidence || []).some(e => e.answer_layer_status === "candidate_only"))
      ? "medium"
      : "low",
    warnings: Array.from(new Set(warningsForResult(matched, ai.status, backendStatus).concat(aiWarnings))),
    inquiry_analysis: inquiry.analysis,
    answer_note: "This endpoint returns a source-bounded graph/evidence trail. It does not produce legal advice and does not treat candidate evidence as answer-safe.",
  });
};
