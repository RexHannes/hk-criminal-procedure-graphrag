#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "investor_recall");
const DEFAULT_OUTPUT = path.join(DATA_DIR, "case_recall_cards.json");
const DEFAULT_REGISTRY = path.join(DATA_DIR, "case_registry_public_v1.json");
const LEGALREF_BODY = "https://legalref.judiciary.hk/lrs/common/search/search_result_detail_body.jsp?ID=&DIS={DIS}&QS=%2B&TP=JU";
const LEGALREF_FRAME = "https://legalref.judiciary.hk/lrs/common/search/search_result_detail_frame.jsp?DIS={DIS}&QS=%2B&TP=JU&ILAN=en";

function parseArgs(argv) {
  const args = {
    targetCases: 10000,
    disStart: 100000,
    disEnd: 360000,
    output: DEFAULT_OUTPUT,
    registry: DEFAULT_REGISTRY,
    allJudgments: false,
    maxRequests: Infinity,
    delayMs: 125,
    resume: true,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--target-cases") args.targetCases = Number(argv[++i] || args.targetCases);
    else if (arg === "--dis-start") args.disStart = Number(argv[++i] || args.disStart);
    else if (arg === "--dis-end") args.disEnd = Number(argv[++i] || args.disEnd);
    else if (arg === "--output") args.output = path.resolve(ROOT, argv[++i] || args.output);
    else if (arg === "--registry") args.registry = path.resolve(ROOT, argv[++i] || args.registry);
    else if (arg === "--all-judgments") args.allJudgments = true;
    else if (arg === "--max-requests") args.maxRequests = Number(argv[++i] || args.maxRequests);
    else if (arg === "--delay-ms") args.delayMs = Number(argv[++i] || args.delayMs);
    else if (arg === "--no-resume") args.resume = false;
  }
  return args;
}

function readJsonIfExists(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function legalRefUrl(template, dis) {
  return template.replace("{DIS}", String(dis));
}

function decodeHtml(value = "") {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
}

function plainTextFromHtml(html = "") {
  return decodeHtml(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sourceIdForCitation(citation = "", dis = "") {
  const clean = citation.toLowerCase().replace(/[\[\]]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return `legalref_${clean}_dis_${dis}`;
}

function extractCaseName(plain = "", citation = "") {
  const beforeCitation = citation ? plain.slice(0, Math.max(0, plain.indexOf(citation))) : plain.slice(0, 300);
  const compact = beforeCitation
    .replace(/\b[A-Z]{2,6}\d+[A-Z]?\/\d{4}\b/g, " ")
    .replace(/\b[A-Z]{2,6}\s+No\.?\s+\d+\s+of\s+\d{4}\b/gi, " ")
    .replace(/\bPress Summary \(English\).*/i, " ")
    .replace(/\s+/g, " ")
    .trim();
  const match = compact.match(/([A-Z][A-Z .,'’&()\-]+?\s+v\.?\s+[A-Z][A-Z .,'’&()\-]+)(?:\s|$)/i);
  if (match) return match[1].replace(/\s+/g, " ").trim();
  const between = plain.match(/BETWEEN\s+(.+?)\s+(Applicant|Appellant|Respondent|Defendant|Plaintiff|and)\b/i);
  if (between) return between[1].replace(/\s+/g, " ").trim();
  return compact.slice(0, 160);
}

function extractCourtLevel(citation = "", plain = "") {
  const cite = citation.toUpperCase();
  if (cite.includes("HKCFA")) return "CFA";
  if (cite.includes("HKCA")) return "CA";
  if (cite.includes("HKCFI")) return "CFI";
  if (cite.includes("HKDC")) return "DC";
  if (cite.includes("HKMAGC")) return "MAG";
  if (/COURT OF FINAL APPEAL/i.test(plain)) return "CFA";
  if (/COURT OF APPEAL/i.test(plain)) return "CA";
  if (/COURT OF FIRST INSTANCE/i.test(plain)) return "CFI";
  if (/DISTRICT COURT/i.test(plain)) return "DC";
  if (/MAGISTRATES?' COURT/i.test(plain)) return "MAG";
  return "";
}

function extractJudgmentDate(plain = "") {
  for (const label of ["Judgment", "Sentence", "Decision", "Reasons for Sentence", "Hearing"]) {
    const match = plain.match(new RegExp(`Date of ${label}:\\s*([0-9]{1,2}\\s+[A-Z][a-z]+\\s+[0-9]{4})`));
    if (match) return match[1];
  }
  const chineseMatch = plain.match(/判案書:\s*([0-9]{4}年[0-9]{1,2}月[0-9]{1,2}日)/);
  return chineseMatch ? chineseMatch[1] : "";
}

function criminalSignals(plain = "") {
  const checks = [
    ["hksar_party", /\bHKSAR\b|\b香港特別行政區\b/i],
    ["criminal_appeal_number", /\b(FACC|CACC|HCMA|HCCC|DCCC|WKCC|KCCC|KTCC|STCC|TMCC|ESCC|FLCC)\b/i],
    ["criminal_label", /\(CRIMINAL\)|CRIMINAL APPEAL|CRIMINAL CASE|刑事/i],
    ["prosecution_terms", /\b(Prosecution|Defendant|Appellant convicted|conviction|sentence|sentencing|imprisonment|bail|charge|offence|offender)\b/i],
    ["ordinance_terms", /\b(Criminal Procedure Ordinance|Theft Ordinance|Dangerous Drugs Ordinance|Crimes Ordinance|Police Force Ordinance)\b/i],
  ];
  return checks.filter(([, pattern]) => pattern.test(plain)).map(([id]) => id);
}

function inferIssueTags(plain = "") {
  const tags = [];
  const lower = plain.toLowerCase();
  const add = (tag, pattern) => { if (pattern.test(lower)) tags.push(tag); };
  add("bail", /\bbail\b|保釋/);
  add("sentencing", /\bsentenc/);
  add("appeal_conviction", /appeal against conviction|unsafe verdict|conviction/);
  add("theft_fraud_dishonesty", /theft ordinance|dishonest|dishonesty|fraud|deceit/);
  add("public_order", /riot|unlawful assembly|public order/);
  add("dangerous_drugs", /dangerous drugs|trafficking|drug/);
  add("national_security", /national security|endangering national security|safeguarding national security/);
  add("search_seizure", /search warrant|seizure|specified evidence/);
  return Array.from(new Set(tags));
}

function parseLegalRefCase({ dis, html }) {
  const plain = plainTextFromHtml(html);
  const neutralCitation = (plain.match(/\[\d{4}\]\s+HK[A-Z][A-Za-z]*\s+\d+/) || [])[0] || "";
  if (!neutralCitation) return null;
  const signals = criminalSignals(plain);
  const sourceUrl = legalRefUrl(LEGALREF_FRAME, dis);
  const fetchUrl = legalRefUrl(LEGALREF_BODY, dis);
  return {
    recall_card_id: sourceIdForCitation(neutralCitation, dis),
    source_id: sourceIdForCitation(neutralCitation, dis),
    case_id: sourceIdForCitation(neutralCitation, dis),
    dis: String(dis),
    case_name: extractCaseName(plain, neutralCitation),
    neutral_citation: neutralCitation,
    court_level: extractCourtLevel(neutralCitation, plain),
    judgment_date_text: extractJudgmentDate(plain),
    source_provider: "LegalRef",
    source_url_or_path: sourceUrl,
    fetch_url: fetchUrl,
    source_visibility: "public_demo",
    tenant_id: "public",
    licence_status: "public_judgment",
    source_kind: "case_judgment",
    evidence_level: "case_recall_only",
    answer_layer_status: "case_recall_only",
    review_status: "citation_verified_public_source",
    answer_safe: false,
    criminal_likely: signals.length >= 2,
    criminal_signals: signals,
    issue_tags: inferIssueTags(plain),
    indexed_text_preview: plain.slice(0, 900),
    hklii_crosscheck_status: "not_attempted",
    public_evidence_sources: [
      {
        provider: "LegalRef",
        evidence_type: "public_judgment_page",
        url: sourceUrl,
        dis: String(dis),
        neutral_citation: neutralCitation,
      },
    ],
  };
}

function normalizeCard(card) {
  const copy = { ...card };
  copy.alternate_legalref_dis = Array.from(new Set([
    ...(copy.alternate_legalref_dis || []),
    copy.dis,
  ].filter(Boolean).map(String))).sort((a, b) => Number(a) - Number(b));
  return copy;
}

async function fetchLegalRef(dis) {
  const response = await fetch(legalRefUrl(LEGALREF_BODY, dis), {
    headers: {
      "user-agent": "Mozilla/5.0 Codex HK criminal case recall harvester; public LegalRef citation validation",
      "accept": "text/html,application/xhtml+xml",
    },
  });
  if (!response.ok) return { ok: false, status: response.status, html: "" };
  return { ok: true, status: response.status, html: await response.text() };
}

function mergeCards(existingCards, newCards) {
  const byCitation = new Map();
  const add = rawCard => {
    const card = normalizeCard(rawCard);
    const key = card.neutral_citation || card.recall_card_id || card.source_id;
    if (!byCitation.has(key)) {
      byCitation.set(key, card);
      return;
    }
    const existing = byCitation.get(key);
    existing.alternate_legalref_dis = Array.from(new Set([
      ...(existing.alternate_legalref_dis || []),
      ...(card.alternate_legalref_dis || []),
      card.dis,
    ].filter(Boolean).map(String))).sort((a, b) => Number(a) - Number(b));
    existing.public_evidence_sources = Array.from(new Map([
      ...((existing.public_evidence_sources || []).map(source => [`${source.provider}:${source.url || source.api_url || source.dis}`, source])),
      ...((card.public_evidence_sources || []).map(source => [`${source.provider}:${source.url || source.api_url || source.dis}`, source])),
    ]).values());
  };
  for (const card of existingCards || []) add(card);
  for (const card of newCards || []) add(card);
  return Array.from(byCitation.values()).sort((a, b) => Number(a.dis || 0) - Number(b.dis || 0));
}

function buildRegistry(cards, args) {
  return {
    registry_id: "hk_criminal_case_registry_public_v1",
    generated_at: new Date().toISOString(),
    target_cases: args.targetCases,
    evidence_level: "case_recall_only",
    source_policy: {
      public_sources_only: true,
      allowed_sources: ["LegalRef", "HKLII", "Judiciary"],
      private_or_licensed_sources_allowed: false,
      answer_safe_by_default: false,
    },
    counts: {
      recall_cards: cards.length,
      criminal_likely: cards.filter(card => card.criminal_likely).length,
      all_judgment_cards: cards.filter(card => !card.criminal_likely).length,
    },
    cases: cards,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const existingPayload = args.resume ? readJsonIfExists(args.output, { case_recall_cards: [] }) : { case_recall_cards: [] };
  let cards = mergeCards(existingPayload.case_recall_cards || [], []);
  const seenDis = new Set(cards.map(card => String(card.dis)));
  const newCards = [];
  let requests = 0;
  let scanned = 0;
  let errors = 0;

  for (let dis = args.disStart; dis <= args.disEnd && cards.length + newCards.length < args.targetCases && requests < args.maxRequests; dis += 1) {
    if (seenDis.has(String(dis))) continue;
    requests += 1;
    scanned += 1;
    try {
      const fetched = await fetchLegalRef(dis);
      if (!fetched.ok) {
        errors += 1;
      } else {
        const card = parseLegalRefCase({ dis, html: fetched.html });
        if (card && (args.allJudgments || card.criminal_likely)) {
          newCards.push(card);
          seenDis.add(String(dis));
        }
      }
    } catch {
      errors += 1;
    }
    if (args.delayMs > 0) await sleep(args.delayMs);
    if (requests % 100 === 0 || newCards.length % 100 === 0 && newCards.length > 0) {
      const merged = mergeCards(cards, newCards);
      writeJson(args.output, {
        artifact_id: "hk_criminal_investor_case_recall_cards_v1",
        generated_at: new Date().toISOString(),
        target_cases: args.targetCases,
        dis_range: [args.disStart, args.disEnd],
        all_judgments: args.allJudgments,
        case_recall_cards: merged,
      });
      writeJson(args.registry, buildRegistry(merged, args));
    }
  }

  cards = mergeCards(cards, newCards);
  const payload = {
    artifact_id: "hk_criminal_investor_case_recall_cards_v1",
    generated_at: new Date().toISOString(),
    target_cases: args.targetCases,
    dis_range: [args.disStart, args.disEnd],
    all_judgments: args.allJudgments,
    status: cards.length >= args.targetCases ? "target_reached" : "partial_resume_available",
    scanned_this_run: scanned,
    requests_this_run: requests,
    errors_this_run: errors,
    case_recall_cards: cards,
  };
  writeJson(args.output, payload);
  writeJson(args.registry, buildRegistry(cards, args));
  console.log(JSON.stringify({
    output: path.relative(ROOT, args.output),
    registry: path.relative(ROOT, args.registry),
    target_cases: args.targetCases,
    total_cards: cards.length,
    new_cards: newCards.length,
    requests_this_run: requests,
    status: payload.status,
    evidence_level: "case_recall_only",
  }, null, 2));
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
