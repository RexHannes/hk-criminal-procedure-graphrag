#!/usr/bin/env node
/* Targeted HKLII discovery for weak issue tags only; not a broad scale-up. */

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
const OUT_JSON = path.join(ROOT, "artifacts", "weak_issue_target_discovery_report.json");
const OUT_MD = path.join(ROOT, "artifacts", "weak_issue_target_discovery_report.md");
const CURRENT_DATE = "2026-06-30";

const TARGETS = [
  {
    issue_id: "criminal_law.theft.belonging_to_another",
    baseline_case_count: 2,
    target_min_cases: 10,
    max_new_or_enriched_cases: 12,
    queries: [
      "\"belonging to another\" \"Theft Ordinance\"",
      "\"property belonging to another\" theft",
      "\"section 6\" \"Theft Ordinance\" HKSAR",
    ],
    hit: text => /belong(?:ing)? to another|belongs to another|property of another/i.test(text),
    principle: "Treat this paragraph as a research-only candidate on the property-belonging-to-another element; use only with full-judgment and current-treatment review.",
    proposition: "This paragraph provides research-only paragraph proof relevant to whether property belonged to another in a theft-linked case.",
  },
  {
    issue_id: "criminal_law.theft.intention_permanently_deprive",
    baseline_case_count: 0,
    target_min_cases: 10,
    max_new_or_enriched_cases: 12,
    queries: [
      "\"permanently deprive\" \"Theft Ordinance\"",
      "\"with the intention of permanently\" theft",
      "\"section 7\" \"Theft Ordinance\" HKSAR",
    ],
    hit: text => /permanent(?:ly)? depriving|permanently deprive|intention of permanently|with the intention of permanently/i.test(text),
    principle: "Treat this paragraph as a research-only candidate on intention permanently to deprive; use only with full-judgment and current-treatment review.",
    proposition: "This paragraph provides research-only paragraph proof relevant to intention permanently to deprive in a theft-linked case.",
  },
  {
    issue_id: "criminal_procedure.bail",
    baseline_case_count: 8,
    target_min_cases: 15,
    max_new_or_enriched_cases: 10,
    queries: [
      "\"bail\" \"Theft Ordinance\"",
      "\"bail\" \"dishonesty\" HKSAR",
      "\"admitted to bail\" \"Theft Ordinance\"",
      "\"pending appeal\" \"Theft Ordinance\"",
    ],
    hit: text => /\bbail\b|admitted to bail|surrender to custody|pending appeal|remand/i.test(text) && /theft|dishonest|fraud|deception|Theft Ordinance|burglary/i.test(text),
    principle: "Use this paragraph only as research-only bail or procedural context in a theft/dishonesty-linked case; it must not be used as a liability rule.",
    proposition: "This paragraph provides research-only bail/procedural context in a theft, dishonesty, fraud or burglary-linked criminal case.",
  },
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "hk-graphrag-weak-issue-target-discovery/1.0" },
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

function issueTagsForText(text = "", targetIssue = "") {
  const tags = new Set([targetIssue]);
  const value = String(text || "");
  if (/theft|stole|stolen|stealing|Theft Ordinance|Cap\.?\s*210|section\s+9|burglary/i.test(value)) tags.add("criminal_law.theft");
  if (/dishonest|dishonesty|Ghosh|Mo Yuk Ping|Ivey/i.test(value)) {
    tags.add("criminal_law.dishonesty");
    tags.add("criminal_law.theft.dishonesty");
    tags.add("criminal_law.theft.mens_rea");
  }
  if (/appropriat/i.test(value)) tags.add("criminal_law.theft.appropriation");
  if (/belong(?:ing)? to another|belongs to another|property of another/i.test(value)) tags.add("criminal_law.theft.belonging_to_another");
  if (/permanent(?:ly)? depriving|permanently deprive|intention of permanently|with the intention of permanently/i.test(value)) tags.add("criminal_law.theft.intention_permanently_deprive");
  if (/fraud|defraud|false accounting|false instrument/i.test(value)) tags.add("criminal_law.fraud");
  if (/deception|deceit|deceiv/i.test(value)) tags.add("criminal_law.deception");
  if (/caution|interview|VRI|video-recorded interview/i.test(value)) tags.add("criminal_procedure.interview_caution");
  if (/\bbail\b|admitted to bail|surrender to custody|pending appeal|remand/i.test(value)) tags.add("criminal_procedure.bail");
  return Array.from(tags);
}

function sentenceContaining(text = "", pattern) {
  const normalized = normalizeParagraphText(text);
  const sentences = normalized.split(/(?<=[.!?])\s+/);
  const found = sentences.find(sentence => pattern.test(sentence));
  if (found && found.length >= 32) return trimToWord(found, 220);
  const match = normalized.match(pattern);
  if (!match) return normalized.split(/\s+/).slice(0, 28).join(" ");
  const start = Math.max(0, match.index - 60);
  return trimToWord(normalized.slice(start, Math.min(normalized.length, match.index + match[0].length + 160)), 220);
}

function trimToWord(text = "", maxLength = 220) {
  const value = normalizeParagraphText(text);
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength).replace(/\s+\S*$/, "").trim();
}

function exactQuote(text = "", issueId = "") {
  if (issueId.includes("belonging_to_another")) return sentenceContaining(text, /belong(?:ing)? to another|belongs to another|property of another/i);
  if (issueId.includes("intention_permanently_deprive")) return sentenceContaining(text, /permanent(?:ly)? depriving|permanently deprive|intention of permanently|with the intention of permanently/i);
  if (issueId.includes("bail")) return sentenceContaining(text, /\bbail\b|admitted to bail|surrender to custody|pending appeal|remand/i);
  return normalizeParagraphText(text).split(/\s+/).slice(0, 28).join(" ");
}

function classifyTarget(issueId = "") {
  if (issueId.includes("bail")) return { legal_function: "procedure", authority_role_candidate: "procedural_history" };
  return { legal_function: "case_application", authority_role_candidate: "case_application" };
}

function selectedParagraph(caseRecord, paragraph, target) {
  const sourceUrl = `${caseRecord.source_url}#p${paragraph.para_no}`;
  const tags = issueTagsForText(`${paragraph.text} ${caseRecord.search_metadata?.charge || ""}`, target.issue_id);
  const classification = classifyTarget(target.issue_id);
  return {
    para_no: paragraph.para_no,
    paragraph_text: paragraph.text,
    source_url: sourceUrl,
    checksum: sha256NormalizedParagraphText(paragraph.text),
    checksum_algorithm: "sha256_normalized_paragraph_text",
    issue_tags_candidate: tags,
    authority_role_candidate: classification.authority_role_candidate,
    legal_function: classification.legal_function,
    exact_quote_support: exactQuote(paragraph.text, target.issue_id),
    proposition_text: target.proposition,
    principle_text: target.principle,
  };
}

function coverage(cases = []) {
  const counts = {};
  for (const item of cases) {
    for (const tag of item.issue_seed_tags || []) counts[tag] = (counts[tag] || 0) + 1;
  }
  return counts;
}

function isCriminalCaseSeed(result = {}) {
  if (!/^\/en\/cases\//.test(result.path || "")) return false;
  if (!result.neutral || !/^\[\d{4}\]\s+HK[A-Z]+\s+\d+/i.test(result.neutral)) return false;
  const hay = [result.title, result.parties, result.charge, result.act, result.db].filter(Boolean).join(" ");
  if (/\bHKSAR\s+v\s+\*/i.test(hay) || /\*\s*\(D\d+\)/i.test(hay)) return false;
  return /\bHKSAR\b|Secretary for Justice|Attorney General|Offence:|Offences:/i.test(hay);
}

async function searchSeeds(target) {
  const seeds = new Map();
  for (const query of target.queries) {
    const url = `https://www.hklii.hk/api/simplesearch?searchstring=${encodeURIComponent(query)}&disablefuzzy=true`;
    const data = await fetchJson(url);
    for (const result of data.results || []) {
      if (!isCriminalCaseSeed(result)) continue;
      const parsed = parseCasePath(result.path);
      if (!parsed) continue;
      if (!seeds.has(result.path)) seeds.set(result.path, { ...result, parsed, discovery_queries: [] });
      seeds.get(result.path).discovery_queries.push(query);
    }
    await sleep(160);
  }
  return Array.from(seeds.values());
}

async function fetchTargetCase(seed, target) {
  const { abbr, year, num } = seed.parsed;
  const data = await fetchJson(`https://www.hklii.hk/api/getjudgment?lang=en&abbr=${abbr}&year=${year}&num=${num}`);
  const judgmentDate = normalizeDate(data.date || seed.pub_date);
  if (judgmentDate > CURRENT_DATE) return null;
  const sourceUrl = `https://www.hklii.hk/en/cases/${abbr}/${year}/${num}`;
  const base = {
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
    issue_seed_tags: [],
    ingestion_status: "l2_paragraph_targeted_verified",
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
    selected_paragraphs: [],
  };
  const paragraphs = paragraphizeHtml(data.content || "")
    .filter(paragraph => target.hit(paragraph.text))
    .slice(0, 3)
    .map(paragraph => selectedParagraph(base, paragraph, target));
  if (!paragraphs.length) return null;
  base.selected_paragraphs = paragraphs;
  base.issue_seed_tags = Array.from(new Set(paragraphs.flatMap(item => item.issue_tags_candidate || [])));
  return base;
}

function mergeCase(existing, incoming) {
  const byPara = new Map((existing.selected_paragraphs || []).map(paragraph => [String(paragraph.para_no), paragraph]));
  for (const paragraph of incoming.selected_paragraphs || []) {
    const existingParagraph = byPara.get(String(paragraph.para_no));
    if (!existingParagraph) {
      byPara.set(String(paragraph.para_no), paragraph);
    } else {
      existingParagraph.issue_tags_candidate = Array.from(new Set([...(existingParagraph.issue_tags_candidate || []), ...(paragraph.issue_tags_candidate || [])]));
      if (/public case context only|not answer-safe|research-only theft or Theft Ordinance context/i.test(existingParagraph.principle_text || "")) {
        existingParagraph.authority_role_candidate = paragraph.authority_role_candidate;
        existingParagraph.legal_function = paragraph.legal_function;
        existingParagraph.proposition_text = paragraph.proposition_text;
        existingParagraph.principle_text = paragraph.principle_text;
      }
      if ((paragraph.exact_quote_support || "").length >= (existingParagraph.exact_quote_support || "").length) {
        existingParagraph.exact_quote_support = paragraph.exact_quote_support;
      }
    }
  }
  existing.selected_paragraphs = Array.from(byPara.values()).sort((a, b) => Number(a.para_no) - Number(b.para_no));
  existing.issue_seed_tags = Array.from(new Set(existing.selected_paragraphs.flatMap(paragraph => paragraph.issue_tags_candidate || [])));
  existing.discovery_queries = Array.from(new Set([...(existing.discovery_queries || []), ...(incoming.discovery_queries || [])]));
  existing.ingestion_status = existing.ingestion_status === "l2_paragraph_sample_verified"
    ? "l2_paragraph_sample_plus_targeted_verified"
    : existing.ingestion_status || "l2_paragraph_targeted_verified";
}

function normalizeCaseIssueTags(cases = []) {
  for (const item of cases) {
    item.issue_seed_tags = Array.from(new Set((item.selected_paragraphs || []).flatMap(paragraph => paragraph.issue_tags_candidate || [])));
  }
}

function targetedCasesForIssue(cases = [], target) {
  const targetQueries = new Set(target.queries);
  return cases
    .filter(item => (item.selected_paragraphs || []).some(paragraph => (paragraph.issue_tags_candidate || []).includes(target.issue_id)))
    .filter(item =>
      /targeted/i.test(item.ingestion_status || "") ||
      (item.discovery_queries || []).some(query => targetQueries.has(query))
    )
    .map(item => ({
      case_id: item.case_id,
      case_name: item.case_name,
      neutral_citation: item.neutral_citation,
      source_url: item.source_url,
      paragraph_count: (item.selected_paragraphs || []).filter(paragraph => (paragraph.issue_tags_candidate || []).includes(target.issue_id)).length,
      paragraph_urls: (item.selected_paragraphs || [])
        .filter(paragraph => (paragraph.issue_tags_candidate || []).includes(target.issue_id))
        .map(paragraph => paragraph.source_url),
    }))
    .sort((a, b) => a.neutral_citation.localeCompare(b.neutral_citation));
}

async function main() {
  if (!fs.existsSync(SOURCE_PATH)) throw new Error(`Missing ${path.relative(ROOT, SOURCE_PATH)}`);
  const artifact = JSON.parse(fs.readFileSync(SOURCE_PATH, "utf8"));
  const cases = artifact.cases || [];
  normalizeCaseIssueTags(cases);
  const byPath = new Map(cases.map(item => [item.source_path, item]));
  const reportTargets = [];

  for (const target of TARGETS) {
    const before = coverage(cases)[target.issue_id] || 0;
    let accepted = 0;
    const acceptedCases = [];
    const skipped = [];
    const seeds = await searchSeeds(target);
    for (const seed of seeds) {
      if ((coverage(cases)[target.issue_id] || 0) >= target.target_min_cases) break;
      if (accepted >= target.max_new_or_enriched_cases) break;
      try {
        const record = await fetchTargetCase(seed, target);
        if (!record) {
          skipped.push({ source_path: seed.path, neutral_citation: seed.neutral, reason: "no_target_paragraph" });
          continue;
        }
        const existing = byPath.get(record.source_path);
        if (existing) {
          mergeCase(existing, record);
          acceptedCases.push({ action: "enriched", case_id: existing.case_id, neutral_citation: existing.neutral_citation, source_url: existing.source_url, paragraph_count: record.selected_paragraphs.length });
        } else {
          cases.push(record);
          byPath.set(record.source_path, record);
          acceptedCases.push({ action: "added", case_id: record.case_id, neutral_citation: record.neutral_citation, source_url: record.source_url, paragraph_count: record.selected_paragraphs.length });
        }
        accepted += 1;
      } catch (error) {
        skipped.push({ source_path: seed.path, neutral_citation: seed.neutral, reason: error.message });
      }
      await sleep(100);
    }
    reportTargets.push({
      issue_id: target.issue_id,
      baseline_case_count: target.baseline_case_count,
      before_case_count: before,
      after_case_count: coverage(cases)[target.issue_id] || 0,
      target_min_cases: target.target_min_cases,
      target_met: (coverage(cases)[target.issue_id] || 0) >= target.target_min_cases,
      accepted_cases: acceptedCases,
      targeted_cases: targetedCasesForIssue(cases, target),
      skipped: skipped.slice(0, 20),
    });
  }

  normalizeCaseIssueTags(cases);
  artifact.generated_at = "2026-06-30T00:00:00.000Z";
  artifact.actual_case_count = cases.length;
  artifact.targeted_weak_issue_discovery = {
    generated_at: "2026-06-30T00:00:00.000Z",
    targets: reportTargets.map(({ issue_id, before_case_count, after_case_count, target_min_cases, target_met }) => ({
      issue_id,
      baseline_case_count: TARGETS.find(target => target.issue_id === issue_id)?.baseline_case_count,
      pre_run_case_count: before_case_count,
      before_case_count,
      after_case_count,
      target_min_cases,
      target_met,
    })),
  };
  artifact.discovery_queries = Array.from(new Set([...(artifact.discovery_queries || []), ...TARGETS.flatMap(target => target.queries)]));
  artifact.discovery_query_count = artifact.discovery_queries.length;
  artifact.extraction_limitations = Array.from(new Set([
    ...(artifact.extraction_limitations || []),
    "Targeted weak-issue cases were added only where public HKLII paragraphs contained the weak issue signal.",
    "This is not a 500-case scale-up; it is a narrow quality/coverage repair pass.",
  ]));
  artifact.source_artifact_checksum = crypto
    .createHash("sha256")
    .update(JSON.stringify(cases.map(item => [item.case_id, item.source_url, item.selected_paragraphs.map(p => p.checksum)])))
    .digest("hex");

  fs.writeFileSync(SOURCE_PATH, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

  const report = {
    report_id: "weak_issue_target_discovery_v1",
    generated_at: "2026-06-30T00:00:00.000Z",
    scope: "Targeted HKLII discovery for weak issues only; no 500-case scaling.",
    source_artifact: "data/legal_ingest/case_corpus/criminal_sample_source_cases.json",
    before_case_count: artifact.target_case_count || 100,
    after_case_count: cases.length,
    targets: reportTargets,
  };
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(OUT_MD, `${[
    "# Weak Issue Target Discovery",
    "",
    report.scope,
    "",
    "| Issue | Original weak baseline | Pre-run | After | Target | Met |",
    "|---|---:|---:|---:|---:|---|",
    ...report.targets.map(item => `| ${item.issue_id} | ${item.baseline_case_count} | ${item.before_case_count} | ${item.after_case_count} | ${item.target_min_cases} | ${item.target_met ? "yes" : "no"} |`),
    "",
    "## Verified Targeted Cases",
    "",
    ...report.targets.flatMap(item => [
      `### ${item.issue_id}`,
      "",
      "| Citation | URL | Paragraphs |",
      "|---|---|---:|",
      ...item.targeted_cases.map(record => `| ${record.neutral_citation} | ${record.source_url} | ${record.paragraph_count} |`),
      "",
    ]),
  ].join("\n")}`, "utf8");
  console.log(JSON.stringify({
    script: "discover_weak_issue_target_cases",
    after_case_count: cases.length,
    targets: reportTargets.map(({ issue_id, baseline_case_count, before_case_count, after_case_count, target_min_cases, target_met }) => ({ issue_id, baseline_case_count, before_case_count, after_case_count, target_min_cases, target_met })),
    status: "passed",
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
