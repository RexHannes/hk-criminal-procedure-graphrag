const fs = require("fs");
const path = require("path");
const { localCaseFruitEvidenceForNode } = require("../src/case_graph/local_case_fruit_evidence");
const { viewerCaseCorpusEvidenceForNode } = require("../src/case_graph/viewer_case_corpus_evidence");

const DATA_ROOT = path.join(process.cwd(), "data", "legal_domain_packs", "demo_maps");
const INDEX_PATH = path.join(process.cwd(), "data", "index.json");

const SAFE_STATUSES = new Set(["human_reviewed", "answer_safe"]);
const VERIFIED_STATUSES = new Set(["paragraph_verified", "source_verified", "human_reviewed", "answer_safe"]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function doctrineNodeIdFor(node, domainId) {
  if (node.doctrine_node_id) return node.doctrine_node_id;
  if (node.id && node.id.startsWith(`${domainId}.`)) return node.id;
  return `${domainId}.${node.id}`;
}

function findStaticNode(nodeId) {
  const registry = readJson(INDEX_PATH);
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
        if (node.id === nodeId || doctrineNodeId === nodeId) {
          return {
            domain_id: domainId,
            doctrine_node_id: doctrineNodeId,
            source_node_id: node.id,
            title: node.label || node.id,
            node_type: node.type || "unknown",
            summary: node.summary || "",
            verification_status: node.verification_status || "needs_hklii_verification",
            answer_layer_status: node.answer_layer_status || "not_product_answer_layer",
            authority_status: node.authority_status || "unverified_case_seed",
          };
        }
      }
    }
  }
  return null;
}

function noEvidencePayload(node, extraWarnings = []) {
  const viewerEvidence = viewerCaseCorpusEvidenceForNode(node.doctrine_node_id);
  if (viewerEvidence.length) {
    const split = splitEvidence(viewerEvidence);
    return {
      doctrine_node_id: node.doctrine_node_id,
      source_node_id: node.source_node_id,
      title: node.title,
      node_type: node.node_type,
      domain_id: node.domain_id,
      coverage_status: "paragraph_verified",
      warnings: Array.from(new Set(["pr6_viewer_case_corpus_fallback", "research_only", "lawyer_review_required", ...extraWarnings])),
      evidence: viewerEvidence,
      candidate_evidence: split.candidate,
      verified_evidence: viewerEvidence,
      answer_safe_evidence: [],
    };
  }
  const localEvidence = localCaseFruitEvidenceForNode(node.doctrine_node_id).map(item => {
    if (item.answer_layer_status === "candidate_only" && item.source_url && item.para_no && (item.paragraph_text || item.supporting_quote || item.proposition_text)) {
      return {
        ...item,
        answer_layer_status: "source_verified",
        source_verification_status: "public_paragraph_linked",
        public_source_link_verified: true,
      };
    }
    return item;
  });
  if (localEvidence.length) {
    const split = splitEvidence(localEvidence);
    return {
      doctrine_node_id: node.doctrine_node_id,
      source_node_id: node.source_node_id,
      title: node.title,
      node_type: node.node_type,
      domain_id: node.domain_id,
      coverage_status: split.coverage,
      warnings: Array.from(new Set([...split.warnings, "local_case_fruits_fixture_fallback", ...extraWarnings])),
      evidence: localEvidence,
      candidate_evidence: split.candidate,
      verified_evidence: split.verified,
      answer_safe_evidence: split.answerSafe,
    };
  }
  return {
    doctrine_node_id: node.doctrine_node_id,
    source_node_id: node.source_node_id,
    title: node.title,
    node_type: node.node_type,
    domain_id: node.domain_id,
    coverage_status: "no_evidence",
    warnings: Array.from(new Set(["insufficient_authority", "no_verified_paragraph_proof", ...extraWarnings])),
    evidence: [],
    candidate_evidence: [],
    verified_evidence: [],
    answer_safe_evidence: [],
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
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase ${table} HTTP ${response.status}: ${text.slice(0, 300)}`);
  }
  return response.json();
}

async function firstSupabaseRow(baseUrl, serviceKey, table, query) {
  const rows = await supabaseGet(baseUrl, serviceKey, table, { ...query, limit: "1" });
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

function hasPublicParagraphProof({ proposition, paragraph, legalCase }) {
  return Boolean(
    (paragraph?.source_url || legalCase?.source_url) &&
    (paragraph?.para_no || proposition?.canonical_para_id) &&
    (paragraph?.text || proposition?.proposition_text || proposition?.candidate_proposition)
  );
}

function evidenceLayerStatus({ reviewStatus, proposition, paragraph, legalCase }) {
  if (SAFE_STATUSES.has(reviewStatus)) return "answer_safe";
  if (VERIFIED_STATUSES.has(reviewStatus)) return "paragraph_verified";
  if (hasPublicParagraphProof({ proposition, paragraph, legalCase })) return "source_verified";
  return "candidate_only";
}

function cleanEvidenceItem({ link, proposition, paragraph, legalCase, reviewItem }) {
  const reviewStatus = link.review_status || proposition.review_status || "machine_candidate";
  const quote = proposition.supporting_quote || reviewItem?.payload_json?.exact_quote || "";
  const answerLayerStatus = evidenceLayerStatus({ reviewStatus, proposition, paragraph, legalCase });
  return {
    case_name: legalCase?.title_en || legalCase?.case_name || "",
    neutral_citation: legalCase?.neutral_citation || "",
    court_level: legalCase?.court_level || "",
    case_id: legalCase?.id || proposition.case_id || "",
    paragraph_id: paragraph?.id || proposition.canonical_para_id || "",
    para_no: paragraph?.para_no || "",
    proposition_id: proposition.id || link.proposition_id || "",
    proposition_text: proposition.proposition_text || proposition.candidate_proposition || "",
    supporting_quote: quote,
    paragraph_text: paragraph?.text || "",
    source_url: paragraph?.source_url || legalCase?.source_url || "",
    link_type: link.link_type || "candidate",
    authority_role: link.link_type || "candidate",
    verification_status: reviewStatus,
    source_verification_status: answerLayerStatus === "source_verified" ? "public_paragraph_linked" : reviewStatus,
    public_source_link_verified: answerLayerStatus === "source_verified" || answerLayerStatus === "paragraph_verified" || answerLayerStatus === "answer_safe",
    answer_layer_status: answerLayerStatus,
    human_review_status: reviewStatus === "human_reviewed" || reviewStatus === "answer_safe" ? "reviewed" : "unreviewed",
    validator_flags: [],
  };
}

function splitEvidence(items) {
  const candidate = [];
  const verified = [];
  const answerSafe = [];
  for (const item of items) {
    if (item.answer_layer_status === "answer_safe") answerSafe.push(item);
    else if (item.answer_layer_status === "paragraph_verified" || item.answer_layer_status === "source_verified") verified.push(item);
    else candidate.push(item);
  }
  let coverage = "no_evidence";
  if (answerSafe.length) coverage = "answer_safe";
  else if (verified.length) coverage = "paragraph_verified";
  else if (candidate.length) coverage = "candidate_only";
  const warnings = [];
  if (!items.length) warnings.push("insufficient_authority", "no_verified_paragraph_proof");
  if (candidate.length && !verified.length && !answerSafe.length) warnings.push("candidate_only", "needs_human_review");
  return { coverage, candidate, verified, answerSafe, warnings };
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const nodeId = String(req.query.node_id || "").trim();
  if (!nodeId) {
    res.status(400).json({ error: "missing_node_id" });
    return;
  }

  const node = findStaticNode(nodeId);
  if (!node) {
    res.status(404).json({ error: "doctrine_node_not_found", doctrine_node_id: nodeId });
    return;
  }

  const viewerEvidence = viewerCaseCorpusEvidenceForNode(node.doctrine_node_id);
  if (viewerEvidence.length) {
    const split = splitEvidence(viewerEvidence);
    res.status(200).json({
      doctrine_node_id: node.doctrine_node_id,
      source_node_id: node.source_node_id,
      title: node.title,
      node_type: node.node_type,
      domain_id: node.domain_id,
      coverage_status: "paragraph_verified",
      warnings: Array.from(new Set(["pr6_viewer_case_corpus_fallback", "research_only", "lawyer_review_required"])),
      evidence: viewerEvidence,
      candidate_evidence: split.candidate,
      verified_evidence: viewerEvidence,
      answer_safe_evidence: [],
    });
    return;
  }

  const supabaseUrl = (process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!supabaseUrl || !serviceKey) {
    res.status(200).json(noEvidencePayload(node, ["backend_not_configured"]));
    return;
  }

  try {
    const links = await supabaseGet(supabaseUrl, serviceKey, "proposition_node_links", {
      doctrine_node_id: `eq.${node.doctrine_node_id}`,
      select: "id,proposition_id,link_type,confidence,review_status,linking_method",
      order: "confidence.desc",
      limit: "25",
    });

    if (!Array.isArray(links) || links.length === 0) {
      res.status(200).json(noEvidencePayload(node));
      return;
    }

    const evidence = [];
    for (const link of links) {
      const proposition = await firstSupabaseRow(supabaseUrl, serviceKey, "proposition_cards", {
        id: `eq.${link.proposition_id}`,
        select: "id,case_id,canonical_para_id,proposition_text,proposition_type,issue_tags,doctrine_tags,review_status,confidence",
      });
      if (!proposition) continue;

      const [paragraph, legalCase] = await Promise.all([
        proposition.canonical_para_id
          ? firstSupabaseRow(supabaseUrl, serviceKey, "legal_paragraphs", {
              id: `eq.${proposition.canonical_para_id}`,
              select: "id,case_id,para_no,text,role_label,source_url,review_status",
            })
          : Promise.resolve(null),
        proposition.case_id
          ? firstSupabaseRow(supabaseUrl, serviceKey, "legal_cases", {
              id: `eq.${proposition.case_id}`,
              select: "id,title_en,neutral_citation,court_level,court,judgment_date,source_url",
            })
          : Promise.resolve(null),
      ]);
      const reviewItem = await firstSupabaseRow(supabaseUrl, serviceKey, "human_review_items", {
        item_id: `eq.${proposition.id}`,
        select: "item_id,payload_json,status",
      }).catch(() => null);

      evidence.push(cleanEvidenceItem({ link, proposition, paragraph, legalCase, reviewItem }));
    }

    const split = splitEvidence(evidence);
    res.status(200).json({
      doctrine_node_id: node.doctrine_node_id,
      source_node_id: node.source_node_id,
      title: node.title,
      node_type: node.node_type,
      domain_id: node.domain_id,
      coverage_status: split.coverage,
      warnings: split.warnings,
      evidence,
      candidate_evidence: split.candidate,
      verified_evidence: split.verified,
      answer_safe_evidence: split.answerSafe,
    });
  } catch (error) {
    res.status(200).json(noEvidencePayload(node, ["backend_query_failed"]));
  }
};
