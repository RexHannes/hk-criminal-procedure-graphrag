#!/usr/bin/env node
/* Discover and merge a larger verified public HK criminal-law corpus from HKLII.
 *
 * Networked discovery script. It is safe to run manually, but CI should rely on
 * committed artifacts and validators only.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {
  ROOT,
  CASE_CORPUS_DIR,
  normalizeParagraphText,
  sha256NormalizedParagraphText,
} = require("../src/legal_answer/case_corpus/case_corpus_store");

const SOURCE_PATH = path.join(CASE_CORPUS_DIR, "criminal_sample_source_cases.json");
const OUT_JSON = path.join(ROOT, "artifacts", "verified_500_case_discovery_report.json");
const OUT_MD = path.join(ROOT, "artifacts", "verified_500_case_discovery_report.md");
const CURRENT_DATE = "2026-06-30";

const DISCOVERY_QUERIES = [
  "offence of theft contrary to section 9 of the Theft Ordinance",
  "\"Theft Ordinance\"",
  "\"offence of theft\" HKSAR",
  "\"theft\" \"District Court\" HKSAR",
  "\"handling stolen goods\"",
  "\"obtaining property by deception\"",
  "\"conspiracy to defraud\"",
  "\"fraud\" HKSAR \"District Court\"",
  "\"deception\" HKSAR \"District Court\"",
  "\"using false instrument\" HKSAR",
  "\"false accounting\" HKSAR",
  "\"forgery\" \"theft\" HKSAR",
  "\"dishonesty\" HKSAR criminal",
  "\"dishonest\" \"Theft Ordinance\"",
  "\"appropriation\" \"Theft Ordinance\"",
  "\"property belonging to another\" theft",
  "\"belonging to another\" \"Theft Ordinance\"",
  "\"permanently deprive\" \"Theft Ordinance\"",
  "\"intention to permanently deprive\"",
  "\"shoplifting\" theft HKSAR",
  "\"stole\" HKSAR \"District Court\"",
  "\"stolen\" HKSAR \"District Court\"",
  "\"burglary\" \"theft\" HKSAR",
  "\"robbery\" \"theft\" HKSAR",
  "\"going equipped for stealing\"",
  "\"video-recorded interview\" HKSAR",
  "\"interview under caution\" HKSAR",
  "\"under caution\" theft HKSAR",
  "\"admitted to bail\" theft",
  "\"bail\" \"dishonesty\" HKSAR",
  "\"bail\" \"Theft Ordinance\"",
  "\"pending appeal\" \"theft\" HKSAR",
  "\"sentence\" \"Theft Ordinance\"",
  "\"sentencing\" \"theft\" HKSAR",
  "\"imprisonment\" \"theft\" HKSAR",
  "\"mitigation\" \"theft\" HKSAR",
  "\"defraud\" \"dishonesty\" HKSAR",
  "\"deceive\" \"property\" HKSAR",
  "\"money laundering\" \"fraud\" HKSAR",
  "\"proceeds of crime\" \"fraud\" HKSAR",
];

const TARGETS = [
  ["criminal_law.theft", 250],
  ["criminal_law.theft.dishonesty", 100],
  ["criminal_law.theft.mens_rea", 100],
  ["criminal_law.theft.appropriation", 100],
  ["criminal_law.theft.belonging_to_another", 40],
  ["criminal_law.theft.intention_permanently_deprive", 40],
  ["criminal_law.theft.sentencing", 150],
  ["criminal_law.fraud", 150],
  ["criminal_law.deception", 150],
  ["criminal_procedure.interview_caution", 75],
  ["criminal_procedure.bail", 40],
];

const TARGET_TERMS = [
  /theft ordinance/i,
  /\bcap\.?\s*210\b/i,
  /\bsection\s+9\b/i,
  /\btheft\b|\bstole\b|\bstolen\b|\bstealing\b/i,
  /\bdishonest(?:y)?\b/i,
  /\bappropriat/i,
  /belong(?:ing)? to another|property of another/i,
  /permanent(?:ly)? deprive|intention to permanently/i,
  /\bdeception\b|\bdeceit\b|\bdeceiv/i,
  /\bfraud\b|\bdefraud\b/i,
  /\bfalse accounting\b|\bfalse instrument\b|\bforgery\b/i,
  /\bshoplift/i,
  /\bburglary\b|\brobbery\b|going equipped for stealing/i,
  /\bsentence\b|\bsentencing\b|\bimprisonment\b|\bcustodial\b|\bmitigat/i,
  /\bcaution\b|\binterview\b|\bVRI\b|\bvideo-recorded interview\b/i,
  /\bbail\b|admitted to bail|pending appeal|remand/i,
  /handling stolen goods/i,
  /money laundering|proceeds of crime/i,
];

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "hk-graphrag-verified-500-corpus/1.0" },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`GET ${url} failed with ${response.status}: ${text.slice(0, 180)}`);
  return JSON.parse(text);
}

function decodeEntities(text = "") {
  return String(text || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
}

function stripTags(html = "") {
  return decodeEntities(String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function parseCasePath(casePath = "") {
  const match = String(casePath || "").match(/^\/en\/cases\/([a-z0-9]+)\/(\d{4})\/(\d+)$/i);
  if (!match) return null;
  return { abbr: match[1].toLowerCase(), year: match[2], num: match[3] };
}

function normalizeDate(dateValue = "") {
  const text = String(dateValue || "");
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
}

function titleCaseName(text = "") {
  const cleaned = String(text || "").replace(/\s+/g, " ").replace(/\s+HCMA$|\s+DCCC$|\s+CACC$|\s+HCCC$/i, "").trim();
  if (!cleaned || /[a-z]/.test(cleaned.replace(/HKSAR|AND|OR|OF|THE|V\./g, ""))) {
    return cleaned.replace(/\bV\.\b/g, "v").replace(/\bv\.\b/g, "v");
  }
  return cleaned
    .toLowerCase()
    .replace(/\b\w/g, char => char.toUpperCase())
    .replace(/\bHksar\b/g, "HKSAR")
    .replace(/\bV\b/g, "v")
    .replace(/\bAnd\b/g, "and")
    .replace(/\bOf\b/g, "of")
    .replace(/\bThe\b/g, "the");
}

function slug(text = "") {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 72);
}

function caseIdFromResult(result, parsed) {
  const name = slug(result.parties || result.title || "case");
  return `hk_${parsed.abbr}_${parsed.year}_${parsed.num}_${name}`.replace(/_+/g, "_");
}

function isCriminalSeed(result = {}) {
  const hay = [result.title, result.parties, result.charge, result.act, result.db].filter(Boolean).join(" ");
  if (!/^\/en\/cases\//.test(result.path || "")) return false;
  if (!result.neutral || !/^\[\d{4}\]\s+HK[A-Z]+\s+\d+/i.test(result.neutral)) return false;
  if (normalizeDate(result.pub_date) > CURRENT_DATE) return false;
  if (/\bHKSAR\s+v\s+\*/i.test(hay) || /\*\s*\(D\d+\)/i.test(hay)) return false;
  return /\bHKSAR\b|Secretary for Justice|Attorney General|Offence:|Offences:/i.test(hay);
}

function issueTagsForText(text = "") {
  const tags = new Set();
  const value = String(text || "");
  if (/theft|stole|stolen|stealing|Theft Ordinance|Cap\.?\s*210|section\s+9|burglary|robbery/i.test(value)) tags.add("criminal_law.theft");
  if (/dishonest|dishonesty|Ghosh|Mo Yuk Ping|Ivey/i.test(value)) {
    tags.add("criminal_law.dishonesty");
    tags.add("criminal_law.theft.dishonesty");
    tags.add("criminal_law.theft.mens_rea");
  }
  if (/appropriat/i.test(value)) tags.add("criminal_law.theft.appropriation");
  if (/permanent(?:ly)? deprive|intention to permanently|intention of permanently/i.test(value)) tags.add("criminal_law.theft.intention_permanently_deprive");
  if (/belong(?:ing)? to another|belongs to another|property of another/i.test(value)) tags.add("criminal_law.theft.belonging_to_another");
  if (/mistake|forgot|forget|accident/i.test(value)) tags.add("criminal_law.theft.mistake_or_forgot_to_pay");
  if (/sentence|sentencing|imprisonment|custodial|mitigat|starting point/i.test(value)) tags.add("criminal_law.theft.sentencing");
  if (/fraud|defraud|false accounting|false instrument|money laundering|proceeds of crime/i.test(value)) tags.add("criminal_law.fraud");
  if (/deception|deceit|deceiv|obtaining property by deception/i.test(value)) tags.add("criminal_law.deception");
  if (/caution|interview|VRI|video-recorded interview/i.test(value)) tags.add("criminal_procedure.interview_caution");
  if (/\bbail\b|admitted to bail|pending appeal|remand/i.test(value)) tags.add("criminal_procedure.bail");
  if (/handling stolen goods/i.test(value)) tags.add("criminal_law.theft.handling_stolen_goods");
  return Array.from(tags);
}

function classifyParagraph(text = "") {
  const value = String(text || "");
  if (/Ghosh|Mo Yuk Ping|Ivey|dishonest(?:y)? test/i.test(value)) return { legal_function: "test", authority_role_candidate: "ratio_candidate" };
  if (/dishonest|dishonesty|appropriat|permanently deprive|belong(?:ing)? to another|property of another/i.test(value)) return { legal_function: "evidential_factor", authority_role_candidate: "case_application" };
  if (/sentence|sentencing|imprisonment|custodial|starting point|mitigat/i.test(value)) return { legal_function: "sentencing", authority_role_candidate: "sentencing_observation" };
  if (/caution|interview|VRI|video-recorded interview|bail|pending appeal/i.test(value)) return { legal_function: "procedure", authority_role_candidate: "procedural_history" };
  if (/section\s+\d+|Theft Ordinance|Cap\.?\s*210/i.test(value)) return { legal_function: "statutory_interpretation", authority_role_candidate: "procedural_history" };
  if (/fraud|defraud|deception|deceit|theft|stole|stolen|stealing/i.test(value)) return { legal_function: "case_application", authority_role_candidate: "application_to_facts" };
  return { legal_function: "background_only", authority_role_candidate: "background" };
}

function paragraphizeHtml(html = "") {
  const paragraphs = [];
  const regex = /<a\s+(?:[^>]*?)(?:name|id)=["']?p?(\d+)["']?[^>]*>[\s\S]*?<\/a>([\s\S]*?)(?=<a\s+(?:[^>]*?)(?:name|id)=["']?p?\d+["']?[^>]*>|$)/gi;
  let match;
  while ((match = regex.exec(html)) && paragraphs.length < 700) {
    const paraNo = match[1];
    const text = normalizeParagraphText(stripTags(match[2]));
    if (text.length < 25) continue;
    paragraphs.push({ para_no: String(paraNo), text });
  }
  return paragraphs;
}

function paragraphScore(paragraph, seed) {
  const value = `${paragraph.text} ${seed.charge || ""} ${seed.title || ""}`;
  let score = 0;
  for (const term of TARGET_TERMS) if (term.test(value)) score += 1;
  if (/Offence:|Offences:|HKSAR/i.test(seed.charge || "")) score += 1;
  if (/Theft Ordinance|Cap\.?\s*210|section\s+9/i.test(value)) score += 2;
  if (/dishonest|dishonesty|deception|defraud|fraud|under caution|VRI|bail|sentence|sentencing/i.test(value)) score += 1.5;
  if (paragraph.text.length < 35) score -= 1;
  return score;
}

function exactQuote(text = "") {
  const normalized = normalizeParagraphText(text);
  const matchers = [
    /Theft Ordinance[^.]{0,160}/i,
    /offence of theft[^.]{0,180}/i,
    /obtaining property by deception[^.]{0,180}/i,
    /handling stolen goods[^.]{0,180}/i,
    /dishonest(?:y)?[^.]{0,180}/i,
    /belong(?:ing)? to another[^.]{0,180}/i,
    /permanent(?:ly)? deprive[^.]{0,180}/i,
    /under caution[^.]{0,180}/i,
    /video-recorded interview[^.]{0,180}/i,
    /\bbail\b[^.]{0,180}/i,
    /sentence[^.]{0,180}/i,
    /imprisonment[^.]{0,180}/i,
    /defraud[^.]{0,180}/i,
    /deception[^.]{0,180}/i,
    /stole[^.]{0,180}/i,
  ];
  for (const matcher of matchers) {
    const found = normalized.match(matcher);
    if (found && found[0].trim().length >= 12) return found[0].trim();
  }
  return normalized.split(/\s+/).slice(0, 28).join(" ");
}

function propositionTextFor(tags, classification) {
  if (classification.legal_function === "sentencing") return "This paragraph provides research-only sentencing context for a theft, dishonesty, deception or theft-linked offence; it must not be used as a liability rule.";
  if (classification.legal_function === "procedure") return "This paragraph records research-only bail, caution, interview or procedural material relevant to evidential triage, not final proof of guilt.";
  if (tags.includes("criminal_law.theft.belonging_to_another")) return "This paragraph is a research-only candidate on whether property belonged to another; it requires current-treatment and lawyer review.";
  if (tags.includes("criminal_law.theft.intention_permanently_deprive")) return "This paragraph is a research-only candidate on intention permanently to deprive; it requires current-treatment and lawyer review.";
  if (tags.includes("criminal_law.theft.dishonesty") || tags.includes("criminal_law.dishonesty")) return "This paragraph is a research-only candidate on dishonesty or mens rea and requires current-treatment and lawyer review.";
  if (tags.includes("criminal_law.deception") || tags.includes("criminal_law.fraud")) return "This paragraph is a research-only candidate on fraud or deception issues and requires lawyer review before reliance.";
  if (tags.includes("criminal_law.theft")) return "This paragraph identifies research-only theft or Theft Ordinance context and should be checked against the full judgment before use.";
  return "This paragraph is background-only public case context and does not itself state a legal rule.";
}

function principleTextFor(tags, classification) {
  if (classification.legal_function === "sentencing") return "Use this case only as sentencing context for theft or theft-linked offending unless a later reviewer extracts a narrower ratio.";
  if (classification.legal_function === "procedure") return "Use this case only as public-source bail, interview or caution context unless a reviewer confirms an evidential rule.";
  if (tags.includes("criminal_law.theft.belonging_to_another")) return "Treat this paragraph as a research-only candidate on the property-belonging-to-another element; use only with full-judgment and current-treatment review.";
  if (tags.includes("criminal_law.theft.intention_permanently_deprive")) return "Treat this paragraph as a research-only candidate on intention permanently to deprive; use only with full-judgment and current-treatment review.";
  if (tags.includes("criminal_law.theft.dishonesty") || tags.includes("criminal_law.dishonesty")) return "Treat the paragraph as a dishonesty or mens rea research candidate, subject to full-judgment and current-treatment review.";
  if (tags.includes("criminal_law.deception") || tags.includes("criminal_law.fraud")) return "Treat the paragraph as a fraud or deception research candidate, subject to full-judgment and current-treatment review.";
  return "Treat the paragraph as public case context only; it is not answer-safe and needs lawyer review.";
}

async function searchSeeds(maxSeeds) {
  const seeds = new Map();
  const failures = [];
  for (const query of DISCOVERY_QUERIES) {
    const url = `https://www.hklii.hk/api/simplesearch?searchstring=${encodeURIComponent(query)}&disablefuzzy=true`;
    try {
      const data = await fetchJson(url);
      for (const result of data.results || []) {
        if (!isCriminalSeed(result)) continue;
        const parsed = parseCasePath(result.path);
        if (!parsed) continue;
        if (!seeds.has(result.path)) seeds.set(result.path, { ...result, parsed, discovery_queries: [] });
        seeds.get(result.path).discovery_queries.push(query);
        if (seeds.size >= maxSeeds) break;
      }
      console.log(`search "${query}" -> ${data.count || 0} result(s), ${seeds.size} criminal seed(s)`);
    } catch (error) {
      failures.push({ query, reason: error.message });
      console.warn(`search "${query}" skipped: ${error.message}`);
    }
    if (seeds.size >= maxSeeds) break;
    await sleep(120);
  }
  return { seeds: Array.from(seeds.values()).sort((a, b) => seedPriority(b) - seedPriority(a)), failures };
}

function seedPriority(seed = {}) {
  const hay = [seed.title, seed.parties, seed.charge, seed.act, ...(seed.discovery_queries || [])].filter(Boolean).join(" ");
  let score = 0;
  if (/permanent(?:ly)? deprive|intention to permanently/i.test(hay)) score += 100;
  if (/belong(?:ing)? to another|property belonging to another/i.test(hay)) score += 70;
  if (/\bbail\b|pending appeal|admitted to bail/i.test(hay)) score += 55;
  if (/dishonest|dishonesty|mens rea/i.test(hay)) score += 30;
  if (/appropriat/i.test(hay)) score += 20;
  if (/fraud|deception|defraud/i.test(hay)) score += 10;
  return score;
}

async function fetchCase(seed) {
  const { abbr, year, num } = seed.parsed;
  const data = await fetchJson(`https://www.hklii.hk/api/getjudgment?lang=en&abbr=${abbr}&year=${year}&num=${num}`);
  const judgmentDate = normalizeDate(data.date || seed.pub_date);
  if (judgmentDate > CURRENT_DATE) return null;
  const sourceUrl = `https://www.hklii.hk/en/cases/${abbr}/${year}/${num}`;
  const paragraphs = paragraphizeHtml(data.content || "");
  const scored = paragraphs
    .map(paragraph => ({ ...paragraph, score: paragraphScore(paragraph, seed) }))
    .filter(paragraph => paragraph.score > 0)
    .sort((a, b) => b.score - a.score || Number(a.para_no) - Number(b.para_no));
  const selected = [];
  const seenPara = new Set();
  for (const paragraph of scored) {
    if (selected.length >= 3) break;
    if (seenPara.has(paragraph.para_no)) continue;
    const tags = issueTagsForText(`${paragraph.text} ${seed.charge || ""} ${seed.title || ""}`);
    if (!tags.length) continue;
    const classification = classifyParagraph(paragraph.text);
    const quote = exactQuote(paragraph.text);
    selected.push({
      para_no: paragraph.para_no,
      paragraph_text: paragraph.text,
      source_url: `${sourceUrl}#p${paragraph.para_no}`,
      checksum: sha256NormalizedParagraphText(paragraph.text),
      checksum_algorithm: "sha256_normalized_paragraph_text",
      issue_tags_candidate: tags,
      authority_role_candidate: classification.authority_role_candidate,
      legal_function: classification.legal_function,
      exact_quote_support: quote,
      proposition_text: propositionTextFor(tags, classification),
      principle_text: principleTextFor(tags, classification),
    });
    seenPara.add(paragraph.para_no);
  }
  if (!selected.length) return null;
  return {
    case_id: caseIdFromResult(seed, seed.parsed),
    case_name: titleCaseName(seed.parties || seed.title || data.title || data.neutral),
    neutral_citation: data.neutral || seed.neutral,
    court: data.db || seed.db,
    judgment_date: judgmentDate,
    source_url: sourceUrl,
    legalref_url: "",
    source_system: "hklii",
    source_path: seed.path,
    source_visibility: "public",
    practice_area_candidates: ["criminal_law"],
    issue_seed_tags: Array.from(new Set(selected.flatMap(item => item.issue_tags_candidate))),
    ingestion_status: "l2_paragraph_500_scale_verified",
    verification_status: "source_verified_public",
    answer_layer_status: "research_only",
    discovery_queries: Array.from(new Set(seed.discovery_queries || [])),
    search_metadata: {
      title: seed.title || "",
      parties: seed.parties || "",
      charge: seed.charge || "",
      action_no: seed.act || "",
      pub_date: seed.pub_date || "",
      coram: seed.coram || "",
    },
    selected_paragraphs: selected,
  };
}

function normalizeCase(record) {
  record.source_visibility = "public";
  record.answer_layer_status = "research_only";
  record.verification_status = record.verification_status || "source_verified_public";
  record.source_system = record.source_system || "hklii";
  record.issue_seed_tags = Array.from(new Set((record.selected_paragraphs || []).flatMap(paragraph => paragraph.issue_tags_candidate || [])));
  for (const paragraph of record.selected_paragraphs || []) {
    paragraph.checksum = paragraph.checksum || sha256NormalizedParagraphText(paragraph.paragraph_text);
    paragraph.source_url = paragraph.source_url || `${record.source_url}#p${paragraph.para_no}`;
  }
  return record;
}

function coverage(cases) {
  const counts = {};
  for (const item of cases) {
    for (const issue of item.issue_seed_tags || []) {
      counts[issue] = (counts[issue] || 0) + 1;
    }
  }
  return counts;
}

function sourceChecksum(cases) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(cases.map(item => [item.case_id, item.source_url, item.selected_paragraphs.map(p => p.checksum)])))
    .digest("hex");
}

function writeReport({ beforeCount, cases, acceptedCases, rejected, searchFailures, targetCases }) {
  const counts = coverage(cases);
  const targets = TARGETS.map(([issue_id, target]) => ({
    issue_id,
    target_case_count: target,
    actual_case_count: counts[issue_id] || 0,
    target_met: (counts[issue_id] || 0) >= target,
  }));
  const report = {
    report_id: "verified_500_case_discovery_v1",
    generated_at: "2026-06-30T00:00:00.000Z",
    source_policy: "Public HKLII judgment API/search only; private/licensed sources excluded.",
    target_case_count: targetCases,
    before_case_count: beforeCount,
    actual_case_count: cases.length,
    accepted_new_or_merged_cases: acceptedCases.length,
    discovery_query_count: DISCOVERY_QUERIES.length,
    discovery_queries: DISCOVERY_QUERIES,
    issue_targets: targets,
    cases: cases.map(item => ({
      case_id: item.case_id,
      case_name: item.case_name,
      citation: item.neutral_citation,
      court: item.court,
      judgment_date: item.judgment_date,
      source_url: item.source_url,
      source_system: item.source_system,
      issue_seed_tags: item.issue_seed_tags,
      verification_status: item.verification_status,
      source_visibility: item.source_visibility,
      answer_layer_status: item.answer_layer_status,
    })),
    rejected_or_skipped: rejected.slice(0, 200),
    search_failures: searchFailures,
  };
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(OUT_MD, `${[
    "# Verified 500-Case Criminal Corpus Discovery",
    "",
    "Public HKLII-only discovery for the theft/dishonesty/fraud/procedure corpus scale-up.",
    "",
    "| Metric | Value |",
    "|---|---:|",
    `| Target cases | ${targetCases} |`,
    `| Baseline cases | ${beforeCount} |`,
    `| Verified cases achieved | ${cases.length} |`,
    `| Accepted new/merged cases | ${acceptedCases.length} |`,
    `| Discovery queries | ${DISCOVERY_QUERIES.length} |`,
    "",
    "## Issue Targets",
    "",
    "| Issue | Actual | Target | Met |",
    "|---|---:|---:|---|",
    ...targets.map(item => `| ${item.issue_id} | ${item.actual_case_count} | ${item.target_case_count} | ${item.target_met ? "yes" : "no"} |`),
    "",
    "## Boundary",
    "",
    "- No private/licensed sources.",
    "- No placeholders or fake count inflation.",
    "- All accepted cases are public-source, research-only candidates.",
    "- If 500 is not reached, the actual verified count above is the honest corpus size for this run.",
    "",
  ].join("\n")}\n`, "utf8");
  return report;
}

async function main() {
  const targetCases = Number(argValue("--target-cases", "500"));
  const maxSeeds = Number(argValue("--max-seeds", "3000"));
  const delayMs = Number(argValue("--delay-ms", "30"));
  const baseArtifact = fs.existsSync(SOURCE_PATH)
    ? JSON.parse(fs.readFileSync(SOURCE_PATH, "utf8"))
    : { cases: [] };
  const beforeCount = (baseArtifact.cases || []).length;
  const cases = (baseArtifact.cases || []).map(normalizeCase);
  const byPath = new Map(cases.map(item => [item.source_path || item.source_url, item]));
  const byUrl = new Map(cases.map(item => [item.source_url, item]));
  const acceptedCases = [];
  const rejected = [];
  const { seeds, failures } = await searchSeeds(maxSeeds);

  for (const seed of seeds) {
    if (cases.length >= targetCases) break;
    try {
      const record = await fetchCase(seed);
      if (!record) {
        rejected.push({ source_path: seed.path, neutral_citation: seed.neutral, reason: "no_target_paragraph" });
      } else if (byPath.has(record.source_path) || byUrl.has(record.source_url)) {
        const existing = byPath.get(record.source_path) || byUrl.get(record.source_url);
        const existingParas = new Map((existing.selected_paragraphs || []).map(paragraph => [String(paragraph.para_no), paragraph]));
        for (const paragraph of record.selected_paragraphs || []) {
          if (!existingParas.has(String(paragraph.para_no))) existing.selected_paragraphs.push(paragraph);
        }
        normalizeCase(existing);
        existing.ingestion_status = "l2_paragraph_sample_plus_500_scale_verified";
        existing.discovery_queries = Array.from(new Set([...(existing.discovery_queries || []), ...(record.discovery_queries || [])]));
        acceptedCases.push({ action: "merged", case_id: existing.case_id, citation: existing.neutral_citation, source_url: existing.source_url });
      } else {
        cases.push(record);
        byPath.set(record.source_path, record);
        byUrl.set(record.source_url, record);
        acceptedCases.push({ action: "added", case_id: record.case_id, citation: record.neutral_citation, source_url: record.source_url });
        console.log(`accepted ${cases.length}/${targetCases}: ${record.neutral_citation} ${record.case_name}`);
      }
    } catch (error) {
      rejected.push({ source_path: seed.path, neutral_citation: seed.neutral, reason: error.message });
    }
    await sleep(delayMs);
  }

  const artifact = {
    ...baseArtifact,
    artifact_id: "criminal_sample_source_cases_v1",
    generated_at: "2026-06-30T00:00:00.000Z",
    source_policy: "Public HKLII judgment API/search only; private/licensed sources excluded; all extracted cards remain research_only.",
    target_case_count: targetCases,
    hard_minimum_case_count: Math.min(120, targetCases),
    actual_case_count: cases.length,
    discovery_query_count: Array.from(new Set([...(baseArtifact.discovery_queries || []), ...DISCOVERY_QUERIES])).length,
    discovery_queries: Array.from(new Set([...(baseArtifact.discovery_queries || []), ...DISCOVERY_QUERIES])),
    extraction_limitations: Array.from(new Set([
      ...(baseArtifact.extraction_limitations || []),
      "500-case discovery is public-source and term-based; actual count may be below 500 where public source proof is not discovered in this run.",
      "Current treatment and ratio/obiter classification remain unchecked unless later lawyer-reviewed.",
      "No answer-safe propositions are created by this scale pass.",
    ])),
    cases,
    rejected_or_skipped: rejected.slice(0, 300),
    source_artifact_checksum: sourceChecksum(cases),
  };
  fs.writeFileSync(SOURCE_PATH, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  const report = writeReport({ beforeCount, cases, acceptedCases, rejected, searchFailures: failures, targetCases });
  console.log(JSON.stringify({
    script: "discover_500_case_criminal_corpus",
    target_case_count: targetCases,
    actual_case_count: report.actual_case_count,
    accepted_new_or_merged_cases: acceptedCases.length,
    status: "passed",
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
