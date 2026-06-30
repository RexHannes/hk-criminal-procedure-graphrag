#!/usr/bin/env node
/* Build a committed public-source criminal case sample from HKLII.
 *
 * This script is intentionally not run in CI. It discovers public HKLII cases,
 * fetches the official judgment API, extracts target paragraphs, and writes a
 * compact source artifact that the offline L1-L3.5 builder can validate and
 * rebuild deterministically.
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

const OUTPUT_PATH = path.join(CASE_CORPUS_DIR, "criminal_sample_source_cases.json");
const CURRENT_DATE = "2026-06-29";

const DISCOVERY_QUERIES = [
  "offence of theft contrary to section 9 of the Theft Ordinance",
  "obtaining property by deception",
  "handling stolen goods",
  "Theft Ordinance Cap 210 dishonesty",
  "dishonesty theft",
  "deception dishonesty sentence",
  "conspiracy to defraud dishonesty",
  "video recorded interview theft",
  "interview under caution theft",
  "stole under caution admitted",
  "robbery Theft Ordinance Cap 210 theft",
  "burglary Theft Ordinance theft",
  "using false instrument deception theft",
  "fraud dishonesty HKSAR theft",
  "shoplifting theft HKSAR",
];

const TARGET_TERMS = [
  /theft ordinance/i,
  /\bcap\.?\s*210\b/i,
  /\bsection\s+9\b/i,
  /\btheft\b/i,
  /\bstole\b|\bstolen\b|\bstealing\b/i,
  /\bdishonest(?:y)?\b/i,
  /\bappropriat/i,
  /belong(?:ing)? to another/i,
  /permanently deprive/i,
  /\bdeception\b|\bdeceit\b/i,
  /\bfraud\b|\bdefraud\b/i,
  /\bshoplift/i,
  /\bsentence\b|\bsentencing\b|\bimprisonment\b|\bcustodial\b/i,
  /\bcaution\b|\binterview\b|\bVRI\b|\bvideo-recorded interview\b/i,
  /\bGhosh\b|\bMo Yuk Ping\b|\bIvey\b/i,
  /handling stolen goods/i,
];

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "hk-graphrag-case-corpus-research-bot/1.0" },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`GET ${url} failed with ${response.status}: ${text.slice(0, 180)}`);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`GET ${url} returned non-JSON: ${text.slice(0, 180)}`);
  }
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
  const cleaned = String(text || "")
    .replace(/\s+/g, " ")
    .replace(/\s+HCMA$|\s+DCCC$|\s+CACC$|\s+HCCC$/i, "")
    .trim();
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
  const hay = [
    result.title,
    result.parties,
    result.charge,
    result.act,
    result.db,
  ].filter(Boolean).join(" ");
  if (!/^\/en\/cases\//.test(result.path || "")) return false;
  if (!result.neutral || !/^\[\d{4}\]\s+HK[A-Z]+\s+\d+/i.test(result.neutral)) return false;
  if (normalizeDate(result.pub_date) > CURRENT_DATE) return false;
  if (/\bHKSAR\s+v\s+\*/i.test(hay) || /\*\s*\(D\d+\)/i.test(hay)) return false;
  return /\bHKSAR\b|Secretary for Justice|Attorney General|Offence:|Offences:/i.test(hay);
}

function issueTagsForText(text = "") {
  const tags = new Set();
  const value = String(text || "");
  if (/theft|stole|stolen|stealing|Theft Ordinance|Cap\.?\s*210|section\s+9/i.test(value)) tags.add("criminal_law.theft");
  if (/dishonest|dishonesty|Ghosh|Mo Yuk Ping|Ivey/i.test(value)) {
    tags.add("criminal_law.dishonesty");
    tags.add("criminal_law.theft.dishonesty");
    tags.add("criminal_law.theft.mens_rea");
  }
  if (/appropriat/i.test(value)) tags.add("criminal_law.theft.appropriation");
  if (/permanently deprive/i.test(value)) tags.add("criminal_law.theft.intention_permanently_deprive");
  if (/belong(?:ing)? to another/i.test(value)) tags.add("criminal_law.theft.belonging_to_another");
  if (/mistake|forgot|forget|accident/i.test(value)) tags.add("criminal_law.theft.mistake_or_forgot_to_pay");
  if (/sentence|sentencing|imprisonment|custodial|mitigat|starting point/i.test(value)) tags.add("criminal_law.theft.sentencing");
  if (/fraud|defraud|false accounting|false instrument/i.test(value)) tags.add("criminal_law.fraud");
  if (/deception|deceit|deceiv/i.test(value)) tags.add("criminal_law.deception");
  if (/caution|interview|VRI|video-recorded interview/i.test(value)) tags.add("criminal_procedure.interview_caution");
  if (/bail/i.test(value)) tags.add("criminal_procedure.bail");
  if (/handling stolen goods/i.test(value)) tags.add("criminal_law.theft.handling_stolen_goods");
  return Array.from(tags);
}

function classifyParagraph(text = "") {
  const value = String(text || "");
  if (/Ghosh|Mo Yuk Ping|Ivey|dishonest(?:y)? test/i.test(value)) {
    return { legal_function: "test", authority_role_candidate: "ratio_candidate" };
  }
  if (/dishonest|dishonesty|appropriat|permanently deprive|belong(?:ing)? to another/i.test(value)) {
    return { legal_function: "evidential_factor", authority_role_candidate: "case_application" };
  }
  if (/sentence|sentencing|imprisonment|custodial|starting point|mitigat/i.test(value)) {
    return { legal_function: "sentencing", authority_role_candidate: "sentencing_observation" };
  }
  if (/caution|interview|VRI|video-recorded interview/i.test(value)) {
    return { legal_function: "procedure", authority_role_candidate: "procedural_history" };
  }
  if (/section\s+\d+|Theft Ordinance|Cap\.?\s*210/i.test(value)) {
    return { legal_function: "statutory_interpretation", authority_role_candidate: "procedural_history" };
  }
  if (/fraud|defraud|deception|deceit|theft|stole|stolen|stealing/i.test(value)) {
    return { legal_function: "case_application", authority_role_candidate: "application_to_facts" };
  }
  return { legal_function: "background_only", authority_role_candidate: "background" };
}

function paragraphScore(paragraph, result) {
  const value = `${paragraph.text} ${result.charge || ""} ${result.title || ""}`;
  let score = 0;
  for (const term of TARGET_TERMS) {
    if (term.test(value)) score += 1;
  }
  if (/Offence:|Offences:|HKSAR/i.test(result.charge || "")) score += 1;
  if (/Theft Ordinance|Cap\.?\s*210|section\s+9/i.test(value)) score += 2;
  if (/dishonest|dishonesty|deception|defraud|fraud|under caution|VRI|sentence|sentencing/i.test(value)) score += 1.5;
  if (paragraph.text.length < 35) score -= 1;
  return score;
}

function paragraphizeHtml(html = "") {
  const paragraphs = [];
  const regex = /<a\s+(?:[^>]*?)(?:name|id)=["']?p?(\d+)["']?[^>]*>[\s\S]*?<\/a>([\s\S]*?)(?=<a\s+(?:[^>]*?)(?:name|id)=["']?p?\d+["']?[^>]*>|$)/gi;
  let match;
  while ((match = regex.exec(html)) && paragraphs.length < 500) {
    const paraNo = match[1];
    const text = normalizeParagraphText(stripTags(match[2]));
    if (text.length < 25) continue;
    paragraphs.push({ para_no: String(paraNo), text });
  }
  return paragraphs;
}

function exactQuote(text = "") {
  const normalized = normalizeParagraphText(text);
  const matchers = [
    /Theft Ordinance[^.]{0,120}/i,
    /offence of theft[^.]{0,140}/i,
    /obtaining property by deception[^.]{0,140}/i,
    /handling stolen goods[^.]{0,140}/i,
    /dishonest(?:y)?[^.]{0,140}/i,
    /under caution[^.]{0,140}/i,
    /video-recorded interview[^.]{0,140}/i,
    /sentence[^.]{0,140}/i,
    /imprisonment[^.]{0,140}/i,
    /defraud[^.]{0,140}/i,
    /deception[^.]{0,140}/i,
    /stole[^.]{0,140}/i,
  ];
  for (const matcher of matchers) {
    const found = normalized.match(matcher);
    if (found && found[0].trim().length >= 12) return found[0].trim();
  }
  const words = normalized.split(/\s+/).slice(0, 24).join(" ");
  return words || normalized.slice(0, 120);
}

function propositionTextFor(paragraph, tags, classification) {
  if (classification.legal_function === "sentencing") {
    return "This paragraph provides research-only sentencing context for a theft, dishonesty, deception or theft-linked offence; it must not be used as a liability rule.";
  }
  if (classification.legal_function === "procedure") {
    return "This paragraph records research-only caution/interview material relevant to evidential triage, not final proof of guilt.";
  }
  if (tags.includes("criminal_law.theft.dishonesty") || tags.includes("criminal_law.dishonesty")) {
    return "This paragraph is a research-only candidate on dishonesty or mens rea and requires current-treatment and lawyer review.";
  }
  if (tags.includes("criminal_law.deception") || tags.includes("criminal_law.fraud")) {
    return "This paragraph is a research-only candidate on fraud or deception issues and requires lawyer review before reliance.";
  }
  if (tags.includes("criminal_law.theft")) {
    return "This paragraph identifies research-only theft or Theft Ordinance context and should be checked against the full judgment before use.";
  }
  return "This paragraph is background-only public case context and does not itself state a legal rule.";
}

function principleTextFor(paragraph, tags, classification) {
  if (classification.legal_function === "sentencing") {
    return "Use this case only as sentencing context for theft or theft-linked offending unless a later reviewer extracts a narrower ratio.";
  }
  if (classification.legal_function === "procedure") {
    return "Use this case only as public-source interview/caution context unless a reviewer confirms an evidential rule.";
  }
  if (tags.includes("criminal_law.theft.dishonesty") || tags.includes("criminal_law.dishonesty")) {
    return "Treat the paragraph as a dishonesty or mens rea research candidate, subject to full-judgment and current-treatment review.";
  }
  if (tags.includes("criminal_law.deception") || tags.includes("criminal_law.fraud")) {
    return "Treat the paragraph as a fraud or deception research candidate, subject to full-judgment and current-treatment review.";
  }
  return "Treat the paragraph as public case context only; it is not answer-safe and needs lawyer review.";
}

async function discoverSeeds() {
  const seeds = new Map();
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
      }
      console.log(`search "${query}" -> ${data.count || 0} result(s), ${seeds.size} criminal seed(s)`);
    } catch (error) {
      console.warn(`search "${query}" skipped: ${error.message}`);
    }
    await sleep(180);
  }
  return Array.from(seeds.values());
}

async function fetchCase(seed) {
  const { abbr, year, num } = seed.parsed;
  const url = `https://www.hklii.hk/api/getjudgment?lang=en&abbr=${abbr}&year=${year}&num=${num}`;
  const data = await fetchJson(url);
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
    const tags = issueTagsForText(`${paragraph.text} ${seed.charge || ""}`);
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
      proposition_text: propositionTextFor(paragraph.text, tags, classification),
      principle_text: principleTextFor(paragraph.text, tags, classification),
    });
    seenPara.add(paragraph.para_no);
  }
  if (!selected.length) return null;
  const caseId = caseIdFromResult(seed, seed.parsed);
  const caseTags = Array.from(new Set(selected.flatMap(item => item.issue_tags_candidate)));
  return {
    case_id: caseId,
    case_name: titleCaseName(seed.parties || seed.title || data.title || data.neutral),
    neutral_citation: data.neutral || seed.neutral,
    court: data.db || seed.db,
    judgment_date: normalizeDate(data.date || seed.pub_date),
    source_url: sourceUrl,
    legalref_url: "",
    source_system: "hklii",
    source_path: seed.path,
    source_visibility: "public",
    practice_area_candidates: ["criminal_law"],
    issue_seed_tags: caseTags,
    ingestion_status: "l2_paragraph_sample_verified",
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

async function main() {
  const targetCases = Number(argValue("--target-cases", "100"));
  const minCases = Number(argValue("--min-cases", "25"));
  const maxSeeds = Number(argValue("--max-seeds", "260"));
  const delayMs = Number(argValue("--delay-ms", "220"));
  const allowBelowMin = hasFlag("--allow-below-min");
  fs.mkdirSync(CASE_CORPUS_DIR, { recursive: true });

  const seeds = (await discoverSeeds()).slice(0, maxSeeds);
  const cases = [];
  const errors = [];
  const seenSourceUrls = new Set();
  for (const seed of seeds) {
    if (cases.length >= targetCases) break;
    try {
      const record = await fetchCase(seed);
      if (!record) {
        errors.push({ path: seed.path, neutral: seed.neutral, reason: "no_target_paragraph" });
      } else if (seenSourceUrls.has(record.source_url)) {
        errors.push({ path: seed.path, neutral: seed.neutral, reason: "duplicate_source_url" });
      } else {
        seenSourceUrls.add(record.source_url);
        cases.push(record);
        console.log(`accepted ${cases.length}/${targetCases}: ${record.neutral_citation} ${record.case_name} (${record.selected_paragraphs.length} para)`);
      }
    } catch (error) {
      errors.push({ path: seed.path, neutral: seed.neutral, reason: error.message });
    }
    await sleep(delayMs);
  }

  const artifact = {
    artifact_id: "criminal_sample_source_cases_v1",
    generated_at: new Date().toISOString(),
    source_policy: "Public HKLII judgment API only; private/licensed sources excluded; all extracted cards remain research_only.",
    target_case_count: targetCases,
    hard_minimum_case_count: minCases,
    actual_case_count: cases.length,
    discovery_query_count: DISCOVERY_QUERIES.length,
    discovery_queries: DISCOVERY_QUERIES,
    extraction_limitations: [
      "Automated paragraph selection is term-based and conservative.",
      "Legal propositions and principles remain machine_candidate / research_only.",
      "Current treatment and ratio/obiter classification are unchecked unless later lawyer-reviewed.",
      "The sample focuses on theft, dishonesty, deception, fraud and theft-linked procedure; it is not a whole HK criminal-law corpus.",
    ],
    cases,
    rejected_or_skipped: errors.slice(0, 200),
    source_artifact_checksum: crypto
      .createHash("sha256")
      .update(JSON.stringify(cases.map(item => [item.case_id, item.source_url, item.selected_paragraphs.map(p => p.checksum)])))
      .digest("hex"),
  };

  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(`wrote ${cases.length} case(s) to ${path.relative(ROOT, OUTPUT_PATH)}`);
  if (cases.length < minCases && !allowBelowMin) {
    console.error(`Only ${cases.length} verified case(s), below minimum ${minCases}.`);
    process.exit(1);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
