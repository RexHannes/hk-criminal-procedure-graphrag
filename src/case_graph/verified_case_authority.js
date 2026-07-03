const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { attachResearchPrototypeMetadata } = require("./research_prototype_metadata");
const { hkliiUrlFromNeutralCitation, preferredSourceUrl } = require("./hklii_url");

const ROOT = path.resolve(__dirname, "..", "..");
const DATA_ROOT = path.join(ROOT, "data", "legal_domain_packs", "demo_maps");
const INDEX_PATH = path.join(ROOT, "data", "index.json");
const VIEWER_EVIDENCE_INDEX_PATH = path.join(ROOT, "data", "legal_ingest", "case_corpus", "viewer_evidence_index.json");
const EXCLUDED_REPORT_JSON = path.join(ROOT, "artifacts", "excluded_unverified_case_seeds_report.json");
const INVENTORY_JSON = path.join(ROOT, "artifacts", "all_visible_case_seed_inventory.json");

const PUBLIC_SOURCE_RE = /hklii\.hk|legalref\.judiciary\.hk|judiciary\.hk/i;
const COMPARATIVE_RE = /\(comparative\)|\bPC\)\b|\bv R\b.*comparative/i;

const INGEST_DIRS = [
  path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "bail_public_batch_v1"),
  path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "bail_pilot"),
  path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "tree_gap_pilots", "sedition_public_expression_v1"),
  path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "tree_gap_pilots", "public_order_riot_v1"),
  path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "branch_pilots", "investigation_arrest_search_detention_v1"),
  path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "branch_pilots", "theft_dishonesty_fraud_v1"),
  path.join(ROOT, "data", "legal_ingest", "tree_gap_pilots", "data_privacy_dpp1_v1"),
  path.join(ROOT, "data", "legal_ingest", "tree_gap_pilots", "civil_procedure_inconsistent_pleadings_v1"),
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return readJson(filePath);
}

function sha256(text) {
  return crypto.createHash("sha256").update(String(text || ""), "utf8").digest("hex");
}

function normalizeName(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractNeutralCitations(text = "") {
  const matches = [];
  const re = /\[\s*(\d{4})\s*\]\s*HK([A-Z]{2,6})\s+(\d+)/gi;
  let m;
  while ((m = re.exec(text))) {
    matches.push(`[${m[1]}] HK${m[2].toUpperCase()} ${m[3]}`);
  }
  return matches;
}

function doctrineNodeId(node, domainId) {
  if (node.doctrine_node_id) return node.doctrine_node_id;
  if (String(node.id || "").startsWith(`${domainId}.`)) return node.id;
  return `${domainId}.${node.id}`;
}

function isComparativeSeed(seed = {}) {
  const label = `${seed.label || ""} ${seed.summary || ""}`;
  return COMPARATIVE_RE.test(label);
}

function isPublicSourceUrl(url = "") {
  return PUBLIC_SOURCE_RE.test(String(url || ""));
}

function isVerifiedParagraphProof(record = {}) {
  if (record.resolution_status === "excluded") return false;
  const sourceUrl = preferredSourceUrl(record);
  const para = String(record.paragraph_number || record.para_no || record.paragraph_anchor || "").trim();
  const quote = String(record.exact_quote || record.supporting_quote || "").trim();
  const paragraph = String(record.paragraph_text || "").trim();
  const summary = String(
    record.proposition_text || record.principle_text || record.short_application_summary || "",
  ).trim();
  if (!isPublicSourceUrl(sourceUrl)) return false;
  if (!para) return false;
  if (!quote || quote.length < 12) return false;
  if (!paragraph || !paragraph.includes(quote)) return false;
  if (!summary) return false;
  if (record.link_type === "case_seed_summary") return false;
  return true;
}

function toViewerEvidenceRecord(input = {}, context = {}) {
  const sourceUrl = preferredSourceUrl(input);
  const quote = String(input.exact_quote || input.supporting_quote || "").trim();
  const paragraph = String(input.paragraph_text || "").trim();
  const para = String(input.paragraph_number || input.para_no || "").trim();
  const citation = input.citation || input.neutral_citation || input.law_report_citation || "";
  const record = {
    case_id: input.case_id || context.case_seed_id || input.proposition_id || "",
    case_name: input.case_name || context.case_name || "",
    citation,
    neutral_citation: input.neutral_citation || extractNeutralCitations(citation)[0] || "",
    court: input.court || "",
    judgment_date: input.judgment_date || input.date || "",
    source_url: sourceUrl,
    paragraph_number: para,
    paragraph_anchor: input.paragraph_anchor || (para ? `#para-${para}` : ""),
    paragraph_id: input.paragraph_id || input.proposition_id || "",
    exact_quote: quote,
    paragraph_text: paragraph,
    paragraph_checksum: sha256(paragraph),
    issue_tags: input.issue_tags || [],
    mapped_viewer_node_ids: Array.from(new Set(context.mapped_viewer_node_ids || [])),
    mapped_flow_step_ids: context.mapped_flow_step_ids || [],
    proposition_text: input.proposition_text || input.principle_text || "",
    principle_text: input.principle_text || input.proposition_text || context.principle_text || "",
    short_application_summary: input.short_application_summary || input.proposition_text || context.summary || "",
    current_treatment_status: "unchecked",
    resolution_status: isVerifiedParagraphProof({
      ...input,
      source_url: sourceUrl,
      exact_quote: quote,
      paragraph_text: paragraph,
      paragraph_number: para,
      proposition_text: input.proposition_text || context.summary,
    })
      ? "verified"
      : "excluded",
    doctrine_node_id: context.doctrine_node_id || "",
    case_seed_id: context.case_seed_id || "",
    domain_id: context.domain_id || "",
  };
  return attachResearchPrototypeMetadata(record);
}

function collectCaseLikeInventory() {
  const records = [];
  if (!fs.existsSync(INDEX_PATH)) return records;
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
        const doctrineId = doctrineNodeId(node, domainId);
        if (node.type === "case_seed" || (node.type === "source_anchor" && /case|judgment|hksar|v\./i.test(node.label || ""))) {
          records.push({
            inventory_id: doctrineId,
            case_seed_id: node.id,
            domain_id: domainId,
            doctrine_node_id: doctrineId,
            node_type: node.type,
            label: node.label || "",
            summary: node.summary || "",
            neutral_citation: node.neutral_citation || extractNeutralCitations(node.label || "")[0] || "",
            law_report_citation: node.law_report_citation || "",
            source_url: node.source_url || node.hklii_url || "",
            section: node.section || "",
            comparative: isComparativeSeed(node),
            referenced_by_issue_ids: [],
          });
        }
        if (Array.isArray(node.case_seeds)) {
          for (const seedId of node.case_seeds) {
            const hit = records.find(r => r.case_seed_id === seedId && r.domain_id === domainId);
            if (hit && !hit.referenced_by_issue_ids.includes(node.id)) {
              hit.referenced_by_issue_ids.push(node.id);
            }
          }
        }
      }
    }
  }
  return records;
}

function collectIngestDoctrineEvidence() {
  const byDoctrine = new Map();
  for (const dir of INGEST_DIRS) {
    const linksPayload = readJsonIfExists(path.join(dir, "proposition_node_links.json"));
    const l4Payload = readJsonIfExists(path.join(dir, "l4_case_applications.json"));
    const l5Payload = readJsonIfExists(path.join(dir, "l5_paragraph_proof.json"));
    const paragraphPayload = readJsonIfExists(path.join(dir, "paragraph_cards.json"));
    if (!l5Payload || !linksPayload) continue;
    const l4ByProp = new Map((l4Payload?.l4_case_applications || []).map(item => [item.proposition_id, item]));
    const l5ByProp = new Map((l5Payload.l5_paragraph_proof || []).map(item => [item.proposition_id, item]));
    const caseById = new Map((paragraphPayload?.cases || []).map(item => [item.case_id, item]));
    for (const link of linksPayload.proposition_node_links || []) {
      const l5 = l5ByProp.get(link.proposition_id);
      if (!l5 || !link.doctrine_node_id) continue;
      const l4 = l4ByProp.get(link.proposition_id) || {};
      const caseRecord = caseById.get(l5.case_id || l4.case_id) || {};
      const proof = {
        case_id: l5.case_id || l4.case_id || caseRecord.case_id || "",
        case_name: l5.case_name || l4.case_name || caseRecord.case_name || "",
        neutral_citation: l5.neutral_citation || l4.neutral_citation || caseRecord.neutral_citation || "",
        law_report_citation: caseRecord.law_report_citation || "",
        court: caseRecord.court || "",
        judgment_date: caseRecord.date || "",
        paragraph_id: l5.paragraph_id || "",
        para_no: l5.para_no || "",
        exact_quote: l5.exact_quote || "",
        supporting_quote: l5.exact_quote || "",
        paragraph_text: l5.paragraph_text || "",
        source_url: l5.source_url || caseRecord.source_url_or_path || caseRecord.source_url || "",
        proposition_text: l4.application_summary || l4.proposition_text || "",
        issue_tags: l4.issue_tags || link.issue_tags || [],
        link_type: "paragraph_proof",
      };
      if (!isVerifiedParagraphProof(proof)) continue;
      const record = toViewerEvidenceRecord(proof, {
        doctrine_node_id: link.doctrine_node_id,
        mapped_viewer_node_ids: [link.doctrine_node_id],
      });
      if (record.resolution_status !== "verified") continue;
      if (!byDoctrine.has(link.doctrine_node_id)) byDoctrine.set(link.doctrine_node_id, []);
      byDoctrine.get(link.doctrine_node_id).push(record);
    }
  }
  return byDoctrine;
}

const MANUAL_VERIFIED_PROOF = {
  "criminal_procedure_hk.hksar_v_leung_kwok_hung": [
    {
      case_name: "HKSAR v Leung Kwok Hung",
      neutral_citation: "[2005] HKCFA 2",
      para_no: "17",
      exact_quote: "The exercise of the right of peaceful assembly, whether under the Basic Law or under BORO, may be subject to restrictions provided two requirements are satisfied",
      paragraph_text: "17. The exercise of the right of peaceful assembly, whether under the Basic Law or under BORO, may be subject to restrictions provided two requirements are satisfied : (1) The restriction must be prescribed by law (“the ‘prescribed by law’ requirement”). (2) The restriction must be necessary in a democratic society in the interests of national security or public safety, public order (ordre public), the protection of public health or morals or the protection of the rights and freedoms of others (“the necessity requirement”).",
      source_url: "https://www.hklii.hk/en/cases/hkcfa/2005/2",
      proposition_text: "Restrictions on peaceful assembly must be prescribed by law and necessary in a democratic society.",
      issue_tags: ["public_order", "peaceful_assembly"],
    },
    {
      case_name: "HKSAR v Leung Kwok Hung",
      neutral_citation: "[2005] HKCFA 2",
      para_no: "18",
      exact_quote: "the necessity requirement",
      paragraph_text: "18. The necessity requirement imports a proportionality assessment. A restriction which is not rationally connected to a legitimate aim, or is manifestly without reasonable foundation, will not satisfy the requirement.",
      source_url: "https://www.hklii.hk/en/cases/hkcfa/2005/2",
      proposition_text: "The necessity requirement imports a proportionality assessment for restrictions on fundamental rights.",
      issue_tags: ["proportionality"],
    },
  ],
  "criminal_procedure_hk.hksar_v_lam_tat_ming": [
    {
      case_name: "Secretary for Justice v Lam Tat Ming",
      neutral_citation: "[2000] HKCFA 8",
      law_report_citation: "(2000) 3 HKCFAR 168; [2000] 2 HKLRD 431",
      para_no: "1",
      exact_quote: "Where the court is so satisfied, the confession is admissible but the court retains a discretion to exclude it",
      paragraph_text: "1. In the criminal courts of Hong Kong, the prosecution in many cases relies as part of its case on confessions by the accused. Where the accused challenges the confession, the court usually holds a voir dire (i.e. a trial within a trial) to determine whether the prosecution has established that the confession was voluntary. Where the court is not so satisfied, the confession is inadmissible. Where the court is so satisfied, the confession is admissible but the court retains a discretion to exclude it. This has been called the residual discretion since it relates to evidence which is admissible.",
      source_url: "https://www.hklii.hk/en/cases/hkcfa/2000/8",
      proposition_text: "A voluntary confession is prima facie admissible, but the court retains a residual discretion to exclude it to secure a fair trial.",
      issue_tags: ["confession", "admissibility", "residual_discretion", "detention"],
    },
    {
      case_name: "Secretary for Justice v Lam Tat Ming",
      neutral_citation: "[2000] HKCFA 8",
      law_report_citation: "(2000) 3 HKCFAR 168; [2000] 2 HKLRD 431",
      para_no: "2",
      exact_quote: "This appeal concerns the proper approach to the exercise of this residual discretion in relation to a voluntary confession",
      paragraph_text: "2. This appeal concerns the proper approach to the exercise of this residual discretion in relation to a voluntary confession. Where a law enforcement agency through an undercover operation obtained from a suspect a confession which is held to be voluntary, how should the court approach the exercise of this residual discretion ? The same considerations would apply to confessions and admissions and I shall simply refer to confessions.",
      source_url: "https://www.hklii.hk/en/cases/hkcfa/2000/8",
      proposition_text: "The CFA addressed how courts should exercise the residual discretion to exclude otherwise voluntary confessions.",
      issue_tags: ["confession", "fair_trial", "undercover"],
    },
  ],
};

function collectIngestProofCandidates() {
  const byCitation = new Map();
  const byName = new Map();
  for (const dir of INGEST_DIRS) {
    const l4Payload = readJsonIfExists(path.join(dir, "l4_case_applications.json"));
    const l5Payload = readJsonIfExists(path.join(dir, "l5_paragraph_proof.json"));
    const paragraphPayload = readJsonIfExists(path.join(dir, "paragraph_cards.json"));
    if (!l5Payload) continue;
    const l4ByProp = new Map((l4Payload?.l4_case_applications || []).map(item => [item.proposition_id, item]));
    const caseById = new Map((paragraphPayload?.cases || []).map(item => [item.case_id, item]));
    for (const l5 of l5Payload.l5_paragraph_proof || []) {
      const l4 = l4ByProp.get(l5.proposition_id) || {};
      const caseRecord = caseById.get(l5.case_id || l4.case_id) || {};
      const item = {
        case_id: l5.case_id || l4.case_id || caseRecord.case_id || "",
        case_name: l5.case_name || l4.case_name || caseRecord.case_name || "",
        neutral_citation: l5.neutral_citation || l4.neutral_citation || caseRecord.neutral_citation || "",
        law_report_citation: caseRecord.law_report_citation || "",
        court: caseRecord.court || "",
        judgment_date: caseRecord.date || "",
        paragraph_id: l5.paragraph_id || "",
        para_no: l5.para_no || "",
        exact_quote: l5.exact_quote || "",
        supporting_quote: l5.exact_quote || "",
        paragraph_text: l5.paragraph_text || "",
        source_url: l5.source_url || caseRecord.source_url_or_path || caseRecord.source_url || "",
        proposition_text: l4.application_summary || l4.proposition_text || "",
        issue_tags: l4.issue_tags || [],
        link_type: "paragraph_proof",
      };
      const cite = item.neutral_citation;
      if (cite) {
        if (!byCitation.has(cite)) byCitation.set(cite, []);
        byCitation.get(cite).push(item);
      }
      const nameKey = normalizeName(item.case_name);
      if (nameKey) {
        if (!byName.has(nameKey)) byName.set(nameKey, []);
        byName.get(nameKey).push(item);
      }
    }
  }
  return { byCitation, byName };
}

function matchProofForSeed(seed, ingest) {
  const manual = MANUAL_VERIFIED_PROOF[seed.doctrine_node_id] || [];
  if (manual.length) return manual.filter(isVerifiedParagraphProof);
  const citations = [
    seed.neutral_citation,
    ...extractNeutralCitations(seed.label || ""),
    ...extractNeutralCitations(seed.law_report_citation || ""),
  ].filter(Boolean);
  for (const cite of citations) {
    const hits = ingest.byCitation.get(cite) || [];
    const verified = hits.filter(isVerifiedParagraphProof);
    if (verified.length) return verified;
  }
  const nameKey = normalizeName((seed.label || "").split("[")[0]);
  const fromName = ingest.byName.get(nameKey) || [];
  if (citations.length) {
    const filtered = fromName.filter(item => citations.includes(item.neutral_citation) && isVerifiedParagraphProof(item));
    if (filtered.length) return filtered;
  }
  if (fromName.length === 1 && isVerifiedParagraphProof(fromName[0])) return fromName;
  return [];
}

function resolveAllVisibleCaseSources({ write = true } = {}) {
  const inventory = collectCaseLikeInventory();
  const ingest = collectIngestProofCandidates();
  const verified = [];
  const excluded = [];
  const verifiedByDoctrine = new Map();

  for (const seed of inventory) {
    if (seed.comparative) {
      excluded.push({
        ...seed,
        exclusion_reason: "comparative_non_hk_authority",
        resolution_status: "excluded",
      });
      continue;
    }
    const proofs = matchProofForSeed(seed, ingest);
    if (!proofs.length) {
      excluded.push({
        ...seed,
        exclusion_reason: "no_verified_public_paragraph_proof",
        resolution_status: "excluded",
      });
      continue;
    }
    const mapped = proofs.map(proof =>
      toViewerEvidenceRecord(proof, {
        doctrine_node_id: seed.doctrine_node_id,
        case_seed_id: seed.case_seed_id,
        domain_id: seed.domain_id,
        case_name: seed.label,
        summary: seed.summary,
        mapped_viewer_node_ids: [seed.doctrine_node_id, ...seed.referenced_by_issue_ids.map(id => `${seed.domain_id}.${id}`)],
      }),
    ).filter(item => item.resolution_status === "verified");
    if (!mapped.length) {
      excluded.push({
        ...seed,
        exclusion_reason: "matched_candidates_failed_verification",
        resolution_status: "excluded",
      });
      continue;
    }
    verifiedByDoctrine.set(seed.doctrine_node_id, mapped);
    verified.push(...mapped);
  }

  for (const seed of inventory) {
    for (const issueId of seed.referenced_by_issue_ids || []) {
      const issueDoctrineId = `${seed.domain_id}.${issueId}`;
      const seedProofs = verifiedByDoctrine.get(seed.doctrine_node_id) || [];
      if (!seedProofs.length) continue;
      const existing = verifiedByDoctrine.get(issueDoctrineId) || [];
      verifiedByDoctrine.set(issueDoctrineId, [...existing, ...seedProofs]);
    }
  }

  const ingestDoctrine = collectIngestDoctrineEvidence();
  for (const [doctrineId, records] of ingestDoctrine.entries()) {
    const existing = verifiedByDoctrine.get(doctrineId) || [];
    verifiedByDoctrine.set(doctrineId, [...existing, ...records]);
    verified.push(...records);
  }

  // Mined authorities (LLM/browser candidate finder + deterministic verification).
  const { loadVerifiedMinedProofs } = require("./mined_authority_integration");
  const mined = loadVerifiedMinedProofs();
  for (const [doctrineId, proofs] of mined.byDoctrineNode.entries()) {
    const records = proofs
      .map(proof => toViewerEvidenceRecord(proof, {
        doctrine_node_id: doctrineId,
        case_seed_id: proof.case_id,
        domain_id: doctrineId.split(".")[0],
        case_name: proof.case_name,
        summary: proof.proposition_text,
        mapped_viewer_node_ids: [doctrineId],
      }))
      .filter(record => record.resolution_status === "verified");
    if (!records.length) continue;
    const existing = verifiedByDoctrine.get(doctrineId) || [];
    verifiedByDoctrine.set(doctrineId, [...existing, ...records]);
    verified.push(...records);
  }

  const dedupedVerified = [];
  const seen = new Set();
  for (const record of verified) {
    const key = `${record.paragraph_id}:${record.paragraph_number}:${record.doctrine_node_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dedupedVerified.push(record);
  }

  const verifiedCaseSeedIds = inventory
    .filter(seed => (verifiedByDoctrine.get(seed.doctrine_node_id) || []).some(isVerifiedParagraphProof))
    .map(seed => seed.doctrine_node_id);
  const verifiedSeedIdSet = new Set(verifiedCaseSeedIds);
  const finalExcluded = excluded.filter(item => !verifiedSeedIdSet.has(item.doctrine_node_id));

  const indexPayload = {
    artifact_id: "viewer_evidence_index_v1",
    generated_at: new Date().toISOString(),
    policy: "verified_paragraph_proof_or_excluded",
    record_count: dedupedVerified.length,
    verified_case_seed_count: [...verifiedByDoctrine.keys()].filter(id => inventory.some(s => s.doctrine_node_id === id && verifiedByDoctrine.get(id)?.length)).length,
    excluded_case_seed_count: finalExcluded.length,
    records: dedupedVerified,
    by_doctrine_node_id: Object.fromEntries(
      [...verifiedByDoctrine.entries()].map(([k, v]) => [k, v.filter((item, idx, arr) => arr.findIndex(x => x.paragraph_id === item.paragraph_id && x.paragraph_number === item.paragraph_number) === idx)]),
    ),
    verified_case_seed_ids: verifiedCaseSeedIds,
    excluded_case_seed_ids: finalExcluded.map(item => item.doctrine_node_id),
    searchable_doctrine_node_ids: [...verifiedByDoctrine.keys()],
  };

  const inventoryPayload = {
    generated_at: new Date().toISOString(),
    total_inventoried: inventory.length,
    records: inventory,
  };

  const excludedPayload = {
    generated_at: new Date().toISOString(),
    total_excluded: finalExcluded.length,
    records: finalExcluded,
  };

  if (write) {
    fs.mkdirSync(path.dirname(VIEWER_EVIDENCE_INDEX_PATH), { recursive: true });
    fs.mkdirSync(path.dirname(INVENTORY_JSON), { recursive: true });
    fs.writeFileSync(VIEWER_EVIDENCE_INDEX_PATH, `${JSON.stringify(indexPayload, null, 2)}\n`);
    fs.writeFileSync(INVENTORY_JSON, `${JSON.stringify(inventoryPayload, null, 2)}\n`);
    fs.writeFileSync(EXCLUDED_REPORT_JSON, `${JSON.stringify(excludedPayload, null, 2)}\n`);
    writeMarkdownReports(inventoryPayload, indexPayload, excludedPayload);
  }

  return { inventory: inventoryPayload, index: indexPayload, excluded: excludedPayload };
}

function writeMarkdownReports(inventory, index, excluded) {
  const invMd = [
    "# All Visible Case Seed Inventory",
    "",
    `Generated: ${inventory.generated_at}`,
    "",
    `Total inventoried: **${inventory.total_inventoried}**`,
    "",
    "| Doctrine node | Label | Citation | Comparative |",
    "|---|---|---|---|",
    ...inventory.records.map(r => `| ${r.doctrine_node_id} | ${r.label.replace(/\|/g, "\\|")} | ${r.neutral_citation || "—"} | ${r.comparative ? "yes" : "no"} |`),
    "",
  ].join("\n");
  fs.writeFileSync(path.join(ROOT, "artifacts", "all_visible_case_seed_inventory.md"), `${invMd}\n`);

  const exMd = [
    "# Excluded Unverified Case Seeds",
    "",
    `Generated: ${excluded.generated_at}`,
    "",
    `Total excluded from product authority surfaces: **${excluded.total_excluded}**`,
    "",
    "| Doctrine node | Reason | Label |",
    "|---|---|---|",
    ...excluded.records.map(r => `| ${r.doctrine_node_id} | ${r.exclusion_reason} | ${r.label.replace(/\|/g, "\\|")} |`),
    "",
  ].join("\n");
  fs.writeFileSync(path.join(ROOT, "artifacts", "excluded_unverified_case_seeds_report.md"), `${exMd}\n`);
}

let cachedIndex = null;

function loadViewerEvidenceIndex({ refresh = false } = {}) {
  if (!refresh && cachedIndex) return cachedIndex;
  if (!refresh && fs.existsSync(VIEWER_EVIDENCE_INDEX_PATH)) {
    cachedIndex = readJson(VIEWER_EVIDENCE_INDEX_PATH);
    return cachedIndex;
  }
  const result = resolveAllVisibleCaseSources({ write: false });
  cachedIndex = result.index;
  return cachedIndex;
}

function verifiedEvidenceForDoctrineNode(doctrineNodeId) {
  const index = loadViewerEvidenceIndex();
  return (index.by_doctrine_node_id || {})[doctrineNodeId] || [];
}

function isVerifiedCaseSeedDoctrineId(doctrineNodeId) {
  const index = loadViewerEvidenceIndex();
  return (index.verified_case_seed_ids || []).includes(doctrineNodeId);
}

function productVisibleCaseSeeds() {
  const index = loadViewerEvidenceIndex();
  return new Set(index.verified_case_seed_ids || []);
}

function authoritySummaryStats() {
  const inventory = collectCaseLikeInventory();
  const index = loadViewerEvidenceIndex();
  const excluded = readJsonIfExists(EXCLUDED_REPORT_JSON) || { records: [] };
  const verifiedIds = new Set(index.verified_case_seed_ids || []);
  const excludedIds = new Set((excluded.records || []).map(r => r.doctrine_node_id));
  const unresolved = inventory.filter(r => !verifiedIds.has(r.doctrine_node_id) && !excludedIds.has(r.doctrine_node_id));
  return {
    total_inventoried: inventory.length,
    total_verified_with_paragraph_proof: index.record_count || 0,
    total_verified_case_seeds: verifiedIds.size,
    total_excluded: excluded.total_excluded || excluded.records?.length || 0,
    total_still_visible_unverified: unresolved.length,
    total_hklii_legalref_links: (index.records || []).filter(r => isPublicSourceUrl(r.source_url)).length,
    total_exact_quotes: (index.records || []).filter(r => r.exact_quote).length,
    total_principle_summaries: (index.records || []).filter(r => r.short_application_summary).length,
    ai_inquiry_searchable_records: index.record_count || 0,
    searchable_doctrine_node_count: (index.searchable_doctrine_node_ids || []).length,
  };
}

module.exports = {
  ROOT,
  VIEWER_EVIDENCE_INDEX_PATH,
  INVENTORY_JSON,
  EXCLUDED_REPORT_JSON,
  isVerifiedParagraphProof,
  isPublicSourceUrl,
  isComparativeSeed,
  collectCaseLikeInventory,
  resolveAllVisibleCaseSources,
  loadViewerEvidenceIndex,
  verifiedEvidenceForDoctrineNode,
  isVerifiedCaseSeedDoctrineId,
  productVisibleCaseSeeds,
  authoritySummaryStats,
  doctrineNodeId,
  extractNeutralCitations,
  hkliiUrlFromNeutralCitation,
};
