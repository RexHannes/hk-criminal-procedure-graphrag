const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const DOMAIN_ROOT = path.join(ROOT, "data", "legal_domain_packs", "demo_maps");
const VIEWER_INDEX_PATH = path.join(ROOT, "data", "legal_ingest", "case_corpus", "viewer_evidence_index.json");
const VIEWER_SEED_PATH = path.join(ROOT, "data", "legal_ingest", "case_corpus", "viewer_seed_case_public_sources.json");
const REGISTRY_PATH = path.join(ROOT, "data", "legal_ingest", "case_authority_registry.json");

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function listJsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) out.push(...listJsonFiles(full));
    else if (item.name.endsWith(".json")) out.push(full);
  }
  return out;
}

function listL5Dirs() {
  return listJsonFiles(path.join(ROOT, "data", "legal_ingest"))
    .filter(file => file.endsWith(`${path.sep}l5_paragraph_proof.json`))
    .map(file => path.dirname(file));
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "").replace(/\s+/g, " ").trim(), "utf8").digest("hex");
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function citationFromLabel(label = "") {
  const match = String(label).match(/\[[^\]]+\]\s+[A-Z]{2,}[A-Z0-9 ]*\s+\d+|\(\d{4}\)\s+\d+\s+[A-Z]{2,}[A-Z0-9 ]*\s+\d+|\[\d{4}\]\s+[A-Z]{2,}[A-Z0-9 ]*\s+\d+/);
  return match ? match[0].trim() : "";
}

function normalizeCaseName(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/\bbetween\b/g, " ")
    .replace(/\brespondent\b|\bappellant\b|\bapplicant\b|\bdefendant\b/g, " ")
    .replace(/\bhksar\b/g, "hong kong special administrative region")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCitation(value = "") {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function sourceUrlWithAnchor(sourceUrl, paraNo) {
  const url = String(sourceUrl || "");
  if (!url) return "";
  if (/#p\d+$/i.test(url)) return url;
  return paraNo ? `${url.replace(/#.*$/, "")}#p${paraNo}` : url;
}

function isPublicParagraphProof(item) {
  const quote = item.exact_quote || item.supporting_quote || "";
  return Boolean(
    item.source_url &&
    /(?:hklii\.hk|legalref\.judiciary\.hk)/i.test(item.source_url) &&
    /#p\d+/i.test(item.source_url) &&
    (item.para_no || item.paragraph_number) &&
    quote &&
    item.paragraph_text &&
    String(item.paragraph_text).includes(quote)
  );
}

function normalizeEvidence(item, source = "unknown") {
  const quote = item.exact_quote || item.supporting_quote || "";
  const paraNo = item.para_no || item.paragraph_number || "";
  const sourceUrl = sourceUrlWithAnchor(item.source_url || item.source_url_or_path, paraNo);
  const evidence = {
    evidence_id: item.evidence_id || `${item.issue_tag || "authority"}::${item.paragraph_id || sha256(`${item.case_name}:${paraNo}:${quote}`).slice(0, 16)}`,
    source_registry: source,
    case_id: item.case_id || "",
    case_name: item.case_name || item.title_en || "",
    citation: item.citation || item.neutral_citation || "",
    neutral_citation: item.neutral_citation || item.citation || "",
    law_report_citation: item.law_report_citation || "",
    court: item.court || "",
    court_level: item.court_level || "",
    judgment_date: item.judgment_date || item.date || "",
    paragraph_id: item.paragraph_id || "",
    paragraph_number: paraNo,
    para_no: paraNo,
    exact_quote: quote,
    supporting_quote: quote,
    paragraph_text: item.paragraph_text || "",
    source_url: sourceUrl,
    checksum: item.checksum || sha256(item.paragraph_text || ""),
    issue_tag: item.issue_tag || (item.issue_tags || [])[0] || "",
    issue_tags: Array.from(new Set([item.issue_tag, ...(item.issue_tags || [])].filter(Boolean))),
    viewer_node_ids: item.viewer_node_ids || [],
    doctrine_node_ids: item.doctrine_node_ids || [],
    flow_step_ids: item.flow_step_ids || [],
    proposition_id: item.proposition_id || "",
    proposition_text: item.proposition_text || "",
    principle_id: item.principle_id || "",
    principle_text: item.principle_text || item.proposition_text || "",
    authority_role: item.authority_role || "",
    significance_label: item.significance_label || "",
    verification_status: "paragraph_linked_public_source",
    source_verification_status: item.source_verification_status || "source_verified_public",
    answer_layer_status: "research_only",
    answer_mode: "research_prototype",
    answer_safe: false,
    lawyer_review_status: "unreviewed",
    professional_advice_certified: false,
    current_treatment_status: item.current_treatment_status || "unchecked",
    usable_in_research_prototype: true,
    usable_in_answer_layer: item.usable_in_answer_layer === true,
    lineage_note: item.lineage_note || item.seed_alignment_warning || "",
  };
  return isPublicParagraphProof(evidence) ? evidence : null;
}

function readArrayPayload(filePath) {
  const payload = readJson(filePath, {});
  const arrayKey = Object.keys(payload || {}).find(key => Array.isArray(payload[key]));
  return arrayKey ? payload[arrayKey] : [];
}

function collectL4L5Evidence() {
  const out = [];
  for (const dir of listL5Dirs()) {
    const l5Rows = readArrayPayload(path.join(dir, "l5_paragraph_proof.json"));
    const l4Rows = readArrayPayload(path.join(dir, "l4_case_applications.json"));
    const linkRows = readArrayPayload(path.join(dir, "proposition_node_links.json"));
    const paragraphPayload = readJson(path.join(dir, "paragraph_cards.json"), {});
    const caseRows = paragraphPayload.cases || [];
    const caseById = new Map(caseRows.map(item => [item.case_id, item]));
    const l4ByProp = new Map(l4Rows.map(item => [item.proposition_id, item]));
    const linksByProp = new Map();
    for (const link of linkRows) {
      if (!linksByProp.has(link.proposition_id)) linksByProp.set(link.proposition_id, []);
      linksByProp.get(link.proposition_id).push(link);
    }
    for (const proof of l5Rows) {
      const l4 = l4ByProp.get(proof.proposition_id) || {};
      const caseRecord = caseById.get(proof.case_id || l4.case_id) || {};
      const links = linksByProp.get(proof.proposition_id) || [];
      const doctrineNodeIds = Array.from(new Set([
        ...(l4.target_doctrine_node_ids || []),
        ...links.map(link => link.doctrine_node_id),
      ].filter(Boolean)));
      const normalized = normalizeEvidence({
        evidence_id: `l5_${proof.proposition_id || proof.l5_proof_id || proof.paragraph_id}`,
        case_id: proof.case_id || l4.case_id || caseRecord.case_id || "",
        case_name: proof.case_name || l4.case_name || caseRecord.case_name || "",
        neutral_citation: proof.neutral_citation || l4.neutral_citation || caseRecord.neutral_citation || "",
        law_report_citation: caseRecord.law_report_citation || "",
        court: caseRecord.court || "",
        court_level: caseRecord.court_level || "",
        judgment_date: caseRecord.date || "",
        paragraph_id: proof.paragraph_id || l4.paragraph_id || "",
        para_no: proof.para_no || proof.paragraph_no || "",
        exact_quote: proof.exact_quote || "",
        paragraph_text: proof.paragraph_text || "",
        source_url: proof.source_url || caseRecord.source_url_or_path || caseRecord.source_url || "",
        issue_tags: Array.from(new Set(links.flatMap(link => link.source_tree_node_ids || []).filter(Boolean))),
        doctrine_node_ids: doctrineNodeIds,
        proposition_id: proof.proposition_id || "",
        proposition_text: l4.application_summary || "",
        principle_text: l4.application_summary || "",
        authority_role: l4.authority_role || links[0]?.authority_role || "",
        significance_label: l4.significance_label || links[0]?.significance_label || "",
        lineage_note: l4.lineage_note || links[0]?.notes || "",
      }, path.relative(ROOT, dir));
      if (normalized) out.push(normalized);
    }
  }
  return out;
}

function collectViewerEvidence() {
  const index = readJson(VIEWER_INDEX_PATH, { evidence: [] });
  const seed = readJson(VIEWER_SEED_PATH, { evidence: [] });
  return [
    ...(index.evidence || []).map(item => normalizeEvidence(item, "viewer_evidence_index")),
    ...(seed.evidence || []).map(item => normalizeEvidence(item, "viewer_seed_case_public_sources")),
  ].filter(Boolean);
}

function collectCaseSeeds() {
  const seeds = [];
  const parentBySeed = new Map();
  for (const filePath of listJsonFiles(DOMAIN_ROOT).filter(file => file.includes(`${path.sep}nodes${path.sep}`))) {
    const payload = readJson(filePath, {});
    const domainId = path.relative(DOMAIN_ROOT, filePath).split(path.sep)[0];
    for (const node of payload.nodes || []) {
      if (Array.isArray(node.case_seeds) && node.case_seeds.length) {
        const parentDoctrineNodeId = doctrineNodeIdForLocalNode(node, domainId);
        for (const seedId of node.case_seeds) {
          const key = String(seedId).includes(".") ? String(seedId) : `${domainId}.${seedId}`;
          if (!parentBySeed.has(key)) parentBySeed.set(key, []);
          parentBySeed.get(key).push(parentDoctrineNodeId);
        }
      }
      if (node.type !== "case_seed") continue;
      seeds.push({
        domain_id: domainId,
        source_file: path.relative(ROOT, filePath),
        source_node_id: node.id,
        doctrine_node_id: `${domainId}.${node.id}`,
        case_label: node.label || node.id,
        citation: node.neutral_citation || node.law_report_citation || citationFromLabel(node.label || ""),
        summary: node.summary || "",
        verification_status: node.verification_status || "",
        authority_status: node.authority_status || "",
      });
    }
  }
  for (const filePath of listJsonFiles(DOMAIN_ROOT).filter(file => file.includes(`${path.sep}edges${path.sep}`))) {
    const payload = readJson(filePath, {});
    const domainId = path.relative(DOMAIN_ROOT, filePath).split(path.sep)[0];
    for (const edge of payload.edges || []) {
      if (edge.relationship !== "case_seed" || !edge.from || !edge.to) continue;
      const key = `${domainId}.${edge.to}`;
      if (!parentBySeed.has(key)) parentBySeed.set(key, []);
      parentBySeed.get(key).push(`${domainId}.${edge.from}`);
    }
  }
  return seeds.map(seed => ({
    ...seed,
    parent_doctrine_node_ids: Array.from(new Set(parentBySeed.get(seed.doctrine_node_id) || [])),
  }));
}

function doctrineNodeIdForLocalNode(node, domainId) {
  if (node.doctrine_node_id) return node.doctrine_node_id;
  if (node.id && String(node.id).startsWith(`${domainId}.`)) return node.id;
  return `${domainId}.${node.id}`;
}

function evidenceMatchesSeed(evidence, seed) {
  if ((evidence.doctrine_node_ids || []).includes(seed.doctrine_node_id) || (evidence.viewer_node_ids || []).includes(seed.source_node_id)) return true;
  const seedCitation = normalizeCitation(seed.citation);
  if (!seedCitation) return false;
  const evidenceCitations = [
    evidence.neutral_citation,
    evidence.law_report_citation,
    evidence.citation,
  ].map(normalizeCitation).filter(Boolean);
  if (!evidenceCitations.includes(seedCitation)) return false;
  const seedName = normalizeCaseName(seed.case_label.replace(seed.citation || "", ""));
  const evidenceName = normalizeCaseName(evidence.case_name);
  return Boolean(seedName && evidenceName && (seedName.includes(evidenceName) || evidenceName.includes(seedName)));
}

function mergeEvidence(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const key = [
      row.neutral_citation || row.citation || row.case_name,
      row.source_url,
      row.para_no || row.paragraph_number || row.paragraph_id,
      row.exact_quote,
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...row, authority_id: `authority_${String(out.length + 1).padStart(5, "0")}` });
  }
  return out;
}

function buildCaseAuthorityRegistry() {
  const evidence = mergeEvidence([...collectViewerEvidence(), ...collectL4L5Evidence()]);
  const seeds = collectCaseSeeds();
  const byDoctrine = {};
  const byCase = {};
  const unresolved = [];
  for (const item of evidence) {
    for (const nodeId of item.doctrine_node_ids || []) {
      if (!byDoctrine[nodeId]) byDoctrine[nodeId] = [];
      byDoctrine[nodeId].push(item.authority_id);
    }
    const caseKey = [item.case_name, item.neutral_citation || item.citation].filter(Boolean).join(" | ");
    if (!byCase[caseKey]) byCase[caseKey] = [];
    byCase[caseKey].push(item.authority_id);
  }

  const seedRecords = seeds.map(seed => {
    const matches = evidence.filter(item => evidenceMatchesSeed(item, seed));
    if (!matches.length) {
      unresolved.push({
        ...seed,
        product_status: "excluded_from_product_authority_surfaces",
        reason_excluded: "No exact public paragraph proof is attached to this seed.",
      });
    }
    return {
      ...seed,
      verified_authority_ids: matches.map(item => item.authority_id),
      product_status: matches.length ? "source_linked_public_judgment" : "excluded_from_product_authority_surfaces",
    };
  });

  for (const seed of seedRecords) {
    for (const parentNodeId of seed.parent_doctrine_node_ids || []) {
      if (!byDoctrine[parentNodeId]) byDoctrine[parentNodeId] = [];
      for (const authorityId of seed.verified_authority_ids || []) {
        byDoctrine[parentNodeId].push(authorityId);
      }
      byDoctrine[parentNodeId] = Array.from(new Set(byDoctrine[parentNodeId]));
    }
  }

  return {
    registry_id: "case_authority_registry_v1",
    generated_at: "2026-06-30T22:15:00+08:00",
    product_rule: "SOURCE PROOF GATE = PUBLIC PARAGRAPH LINK + EXACT QUOTE; LAWYER REVIEW IS QUIET METADATA FOR LATER HITL.",
    counts: {
      verified_authority_count: evidence.length,
      unique_case_count: Object.keys(byCase).length,
      scanned_case_seed_count: seeds.length,
      source_linked_case_seed_count: seedRecords.filter(item => item.verified_authority_ids.length).length,
      excluded_case_seed_count: unresolved.length,
      doctrine_node_count: Object.keys(byDoctrine).length,
    },
    source_policy: {
      visible_authority_requires_public_paragraph_proof: true,
      lawyer_review_blocks_research_prototype: false,
      answer_mode: "research_prototype",
      professional_advice_certified: false,
      unverified_seeds_excluded: true,
    },
    authorities: evidence,
    by_doctrine_node_id: byDoctrine,
    by_case: byCase,
    case_seed_nodes: seedRecords,
    unresolved_case_seed_nodes: unresolved,
  };
}

function writeCaseAuthorityRegistry(filePath = REGISTRY_PATH) {
  const registry = buildCaseAuthorityRegistry();
  writeJson(filePath, registry);
  return registry;
}

let cachedRegistry = null;

function loadCaseAuthorityRegistry() {
  if (cachedRegistry) return cachedRegistry;
  cachedRegistry = readJson(REGISTRY_PATH, null) || buildCaseAuthorityRegistry();
  return cachedRegistry;
}

function authorityEvidenceForNode(nodeId, limit = 12) {
  const registry = loadCaseAuthorityRegistry();
  const ids = registry.by_doctrine_node_id?.[nodeId] || [];
  const byId = new Map((registry.authorities || []).map(item => [item.authority_id, item]));
  return ids.map(id => byId.get(id)).filter(Boolean).slice(0, limit);
}

module.exports = {
  REGISTRY_PATH,
  buildCaseAuthorityRegistry,
  writeCaseAuthorityRegistry,
  loadCaseAuthorityRegistry,
  authorityEvidenceForNode,
  isPublicParagraphProof,
};
