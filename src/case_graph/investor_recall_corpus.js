const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { fetchUrl, stripHtmlToText } = require("./build_public_bail_batch");
const { extractLegalRefDis, validateNeutralCitation } = require("./scale_ingest_safeguards");

const ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_OUTPUT_DIR = path.join(ROOT, "data", "legal_ingest", "investor_recall", "corpus_v1");

const CRIMINAL_HEADER_RE = /\(CRIMINAL\)|CRIMINAL NO\.|HKSAR v\.|HKSAR v |appeal against conviction|appeal against sentence|bail application|refusal of bail|search warrant|magistracy|magistrate|sentencing|criminal appeal|刑事|上訴|保釋|搜查/i;
const CITATION_RE = /\[\d{4}\]\s+HK[A-Z0-9]+\s+\d+/i;

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function slugCaseId(neutralCitation, dis) {
  const cite = String(neutralCitation || "").replace(/[^\w]+/g, "_").toLowerCase().slice(0, 80);
  return `hk_legalref_${dis}_${cite || "case"}`.replace(/_+/g, "_");
}

function legalRefUrls(dis) {
  const qs = encodeURIComponent("+");
  return {
    source_url_or_path: `https://legalref.judiciary.hk/lrs/common/search/search_result_detail_frame.jsp?DIS=${dis}&QS=${qs}&TP=JU&ILAN=en`,
    fetch_url: `https://legalref.judiciary.hk/lrs/common/search/search_result_detail_body.jsp?ID=&DIS=${dis}&QS=${qs}&TP=JU`,
  };
}

function parseLegalRefBodyMetadata(html, dis) {
  const text = stripHtmlToText(html).replace(/\s+/g, " ").trim();
  if (!text || text.length < 80) return null;
  const citationMatch = text.match(CITATION_RE);
  const neutralCitation = citationMatch ? citationMatch[0].trim() : "";
  if (!neutralCitation || validateNeutralCitation(neutralCitation)) return null;
  const caseNameMatch = text.match(/BETWEEN\s+(.{0,120}?)\s+Appellant/i)
    || text.match(/HKSAR v\.?\s+([A-Z][^(]{2,80})/i)
    || text.match(/IN THE MATTER OF\s+(.{10,120})/i);
  const caseName = caseNameMatch ? caseNameMatch[1].replace(/\s+/g, " ").trim() : "";
  const courtMatch = text.match(/IN THE (COURT OF [A-Z ]+|MAGISTRATES' COURT[^.]*)/i);
  const court = courtMatch ? courtMatch[1].trim() : "";
  const criminalLikely = CRIMINAL_HEADER_RE.test(text.slice(0, 4000));
  return {
    dis: String(dis),
    neutral_citation: neutralCitation,
    case_name: caseName,
    court,
    criminal_likely: criminalLikely,
    recall_text: text.slice(0, 2500),
    body_char_count: text.length,
  };
}

function buildCaseRecallRecord(meta, { fruitTier = "recall_index" } = {}) {
  const urls = legalRefUrls(meta.dis);
  const caseId = slugCaseId(meta.neutral_citation, meta.dis);
  return {
    case_id: caseId,
    source_id: caseId,
    dis: meta.dis,
    case_name: meta.case_name,
    neutral_citation: meta.neutral_citation,
    court: meta.court,
    court_level: "",
    source_kind: "case_judgment_recall",
    fruit_tier: fruitTier,
    answer_layer_status: "case_recall_only",
    review_status: "machine_candidate",
    answer_safe: false,
    human_review_required: true,
    source_visibility: "public_demo",
    tenant_id: "public",
    licence_status: "public_judgment",
    domain_id: "criminal_procedure_hk",
    practice_area: "criminal_procedure",
    criminal_likely: meta.criminal_likely === true,
    recall_text: meta.recall_text,
    body_char_count: meta.body_char_count,
    ...urls,
    ingestion_status: "recall_indexed",
    authority_status: "legalref_metadata_snippet",
    vector_scope: "investor_recall_corpus_v1",
    accuracy_tier: "investor_recall",
    accuracy_note: "Case-level LegalRef recall card. Not quote-verified proposition fruit. Do not cite as answer-safe holding.",
  };
}

async function harvestLegalRefDis({
  startDis,
  endDis,
  concurrency = 24,
  criminalOnly = true,
  maxCases = 30000,
  onProgress,
} = {}) {
  const records = [];
  const errors = [];
  let scanned = 0;
  const disList = [];
  for (let dis = startDis; dis <= endDis; dis += 1) disList.push(dis);

  async function worker(dis) {
    scanned += 1;
    if (onProgress && scanned % 500 === 0) onProgress({ scanned, accepted: records.length, dis });
    try {
      const html = await fetchUrl(legalRefUrls(dis).fetch_url, { retries: 3, timeoutMs: 25000, retryDelayMs: 2000 });
      const meta = parseLegalRefBodyMetadata(html, dis);
      if (!meta || !meta.neutral_citation) return;
      if (criminalOnly && !meta.criminal_likely) return;
      records.push(buildCaseRecallRecord(meta));
    } catch (error) {
      errors.push({ dis, message: error.message });
    }
  }

  let index = 0;
  async function runPool() {
    const runners = Array.from({ length: concurrency }, async () => {
      while (index < disList.length && records.length < maxCases) {
        const dis = disList[index];
        index += 1;
        await worker(dis);
      }
    });
    await Promise.all(runners);
  }
  await runPool();
  return { records, errors: errors.slice(0, 50), scanned, accepted: records.length };
}

function dedupeRecords(records) {
  const byKey = new Map();
  for (const record of records) {
    const key = record.neutral_citation || `dis:${record.dis}`;
    if (!byKey.has(key)) byKey.set(key, record);
  }
  return Array.from(byKey.values());
}

function collectPilotSources(root = ROOT) {
  const manifests = [];
  const dirs = [
    path.join(root, "data/legal_ingest/criminal_evidence_tree_v1/bail_public_batch_v1"),
    path.join(root, "data/legal_ingest/criminal_evidence_tree_v1/tree_gap_pilots"),
    path.join(root, "data/legal_ingest/criminal_evidence_tree_v1/branch_pilots"),
  ];
  function walkManifests(dir) {
    if (!fs.existsSync(dir)) return;
    const stat = fs.statSync(dir);
    if (stat.isFile() && dir.endsWith("source_manifest.json")) {
      manifests.push(dir);
      return;
    }
    if (!stat.isDirectory()) return;
    for (const entry of fs.readdirSync(dir)) {
      walkManifests(path.join(dir, entry));
    }
  }
  for (const dir of dirs) walkManifests(dir);
  const records = [];
  for (const manifestPath of manifests) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    for (const source of manifest.sources || []) {
      const dis = extractLegalRefDis(source.fetch_url || source.source_url_or_path || "");
      if (!dis) continue;
      records.push(buildCaseRecallRecord({
        dis,
        neutral_citation: source.neutral_citation || "",
        case_name: source.case_name || "",
        court: source.court || "",
        criminal_likely: true,
        recall_text: `${source.neutral_citation || ""} ${source.case_name || ""} ${manifest.scope || ""} Hong Kong criminal procedure`.trim(),
        body_char_count: 0,
      }, { fruitTier: "quote_verified_pilot" }));
    }
  }
  return records;
}

function importJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const row = JSON.parse(line);
      const dis = row.dis || extractLegalRefDis(row.fetch_url || row.source_url_or_path || "");
      return buildCaseRecallRecord({
        dis: dis || row.dis,
        neutral_citation: row.neutral_citation || "",
        case_name: row.case_name || "",
        court: row.court || "",
        criminal_likely: row.criminal_likely !== false,
        recall_text: row.recall_text || `${row.neutral_citation || ""} ${row.case_name || ""}`.trim(),
        body_char_count: (row.recall_text || "").length,
      });
    });
}

function writeCorpusArtifacts({
  records,
  outputDir = DEFAULT_OUTPUT_DIR,
  targetCases = 25000,
  harvestMeta = {},
} = {}) {
  const deduped = dedupeRecords(records);
  const manifest = {
    corpus_id: "hk_criminal_investor_recall_corpus_v1",
    generated_at: new Date().toISOString(),
    target_cases: targetCases,
    case_count: deduped.length,
    pending_to_target: Math.max(0, targetCases - deduped.length),
    fruit_tier_policy: {
      recall_index: "LegalRef metadata + judgment snippet for semantic case search only",
      quote_verified_pilot: "Existing pilot sources merged for overlap with deep fruits",
      answer_safe: "Not included in this corpus builder",
    },
    investor_accuracy_tiers: {
      tier_1_recall: `${deduped.length} cases searchable by citation/name/issue (case_recall_only)`,
      tier_2_quote_verified: "Use branch pilots + bail batch proposition cards (machine_candidate)",
      tier_3_answer_safe: "Gold-reviewed propositions only (currently 3 bail CFA cards)",
      honest_pitch: "Tell investors: large criminal case recall corpus now; proposition-level answer accuracy grows branch-by-branch.",
    },
    harvest: harvestMeta,
    source_policy: {
      public_sources_only: true,
      legalref_only: true,
      bulk_auto_attach_propositions: false,
    },
  };
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "corpus_manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(path.join(outputDir, "case_recall_cards.json"), `${JSON.stringify({
    corpus_id: manifest.corpus_id,
    case_count: deduped.length,
    case_recall_cards: deduped,
  }, null, 2)}\n`);
  return { manifest, records: deduped, outputDir };
}

module.exports = {
  DEFAULT_OUTPUT_DIR,
  buildCaseRecallRecord,
  collectPilotSources,
  dedupeRecords,
  harvestLegalRefDis,
  importJsonl,
  parseLegalRefBodyMetadata,
  slugCaseId,
  writeCorpusArtifacts,
};
