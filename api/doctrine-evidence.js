const fs = require("fs");
const path = require("path");
const { localCaseFruitEvidenceForNode } = require("../src/case_graph/local_case_fruit_evidence");
const {
  evidenceForDoctrineNode,
  promoteEvidenceItem,
  dedupeEvidence,
  isVerifiedParagraphProof,
} = require("../src/case_graph/case_authority_bridge");
const { attachResearchPrototypeMetadata } = require("../src/case_graph/research_prototype_metadata");
const { verifiedEvidenceForDoctrineNode } = require("../src/case_graph/verified_case_authority");
const { diversifyEvidence, groupEvidenceByCaseForAnswer } = require("../src/case_graph/retrieval_diversity");

const DATA_ROOT = path.join(process.cwd(), "data", "legal_domain_packs", "demo_maps");
const INDEX_PATH = path.join(process.cwd(), "data", "index.json");
const CASE_SEED_PROOF_PATH = path.join(process.cwd(), "data", "legal_ingest", "case_authority_registry.json");

const VERIFIED_STATUSES = new Set([
  "paragraph_verified",
  "source_verified",
  "human_reviewed",
  "answer_safe",
  "verified",
  "verified_case_linked",
  "verified_public_authority",
]);

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
            verification_status: node.verification_status || "verified",
            answer_layer_status: node.answer_layer_status || "paragraph_verified",
            authority_status: node.authority_status || "verified_case_linked",
            source_url: node.source_url || node.hklii_url || "",
            neutral_citation: node.neutral_citation || "",
          };
        }
      }
    }
  }
  return null;
}

function localEvidenceForNode(node) {
  return dedupeEvidence([
    ...localCaseFruitEvidenceForNode(node.doctrine_node_id).filter(isVerifiedParagraphProof),
    ...verifiedEvidenceForDoctrineNode(node.doctrine_node_id),
  ]);
}

function caseSeedProofForNode(doctrineNodeId) {
  return verifiedEvidenceForDoctrineNode(doctrineNodeId);
}

function mergeLocalEvidence(node, evidence = [], extraWarnings = []) {
  const merged = [...evidence];
  const seen = new Set(merged.map(item => item.proposition_id || item.paragraph_id || `${item.case_id}:${item.para_no}`));
  for (const item of [...localEvidenceForNode(node), ...caseSeedProofForNode(node.doctrine_node_id).map(promoteEvidenceItem)]) {
    const key = item.proposition_id || item.paragraph_id || `${item.case_id}:${item.para_no}`;
    if (seen.has(key)) continue;
    merged.push(item);
    seen.add(key);
  }
  const diversified = diversifyEvidence(merged, {});
  const split = splitEvidence(diversified);
  return {
    doctrine_node_id: node.doctrine_node_id,
    source_node_id: node.source_node_id,
    title: node.title,
    node_type: node.node_type,
    domain_id: node.domain_id,
    coverage_status: split.coverage,
    warnings: [],
    evidence: diversified,
    case_authorities: groupEvidenceByCaseForAnswer(diversified, {}),
    candidate_evidence: split.candidate,
    verified_evidence: split.verified,
    answer_safe_evidence: split.answerSafe,
  };
}

function noEvidencePayload(node, extraWarnings = []) {
  const localEvidence = localEvidenceForNode(node);
  if (localEvidence.length) {
    return mergeLocalEvidence(node, [], ["local_case_fruits_fixture_fallback", ...extraWarnings]);
  }
  return {
    doctrine_node_id: node.doctrine_node_id,
    source_node_id: node.source_node_id,
    title: node.title,
    node_type: node.node_type,
    domain_id: node.domain_id,
    coverage_status: "no_evidence",
    warnings: [],
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

function evidenceLayerStatus({ proposition, paragraph, legalCase, quoteVerified }) {
  if (quoteVerified && hasPublicParagraphProof({ proposition, paragraph, legalCase })) return "paragraph_verified";
  return "no_paragraph_proof";
}

function cleanEvidenceItem({ link, proposition, paragraph, legalCase, reviewItem }) {
  const reviewStatus = link.review_status || proposition.review_status || "machine_candidate";
  const quote = proposition.supporting_quote || reviewItem?.payload_json?.exact_quote || "";
  const paragraphText = paragraph?.text || "";
  const quoteVerified = Boolean(quote && paragraphText && paragraphText.includes(quote));
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
    supporting_quote: quote,
    exact_quote: quote,
    paragraph_text: paragraphText,
    source_url: paragraph?.source_url || legalCase?.source_url || "",
    link_type: link.link_type || "candidate",
    authority_role: link.link_type || "candidate",
    verification_status: reviewStatus,
    source_verification_status: answerLayerStatus === "paragraph_verified" ? "public_paragraph_linked" : reviewStatus,
    public_source_link_verified: answerLayerStatus === "paragraph_verified",
    answer_layer_status: answerLayerStatus,
    quote_verified: quoteVerified,
    validator_flags: [],
  });
}

function splitEvidence(items) {
  const verified = items.filter(item => item.answer_layer_status === "paragraph_verified" || item.answer_layer_status === "source_verified");
  const answerSafe = items.filter(item => item.answer_layer_status === "answer_safe");
  const candidate = items.filter(item => !verified.includes(item) && !answerSafe.includes(item));
  let coverage = "no_evidence";
  if (verified.length) coverage = "paragraph_verified";
  else if (answerSafe.length) coverage = "paragraph_verified";
  return { coverage, candidate, verified, answerSafe, warnings: [] };
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

    const paragraphProof = evidence.filter(item => item.answer_layer_status === "paragraph_verified" && item.quote_verified);
    const split = splitEvidence(paragraphProof);
    res.status(200).json({
      ...mergeLocalEvidence(node, paragraphProof, split.warnings),
      answer_mode: "research_prototype",
      professional_advice_certified: false,
      lawyer_review_status: "unreviewed",
    });
  } catch (error) {
    res.status(200).json(noEvidencePayload(node, ["backend_query_failed"]));
  }
};
