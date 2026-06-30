#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_INPUT = path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "investor_recall", "case_recall_cards.json");
const DEFAULT_REGISTRY = path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "investor_recall", "case_registry_public_v1.json");
const HKLII_API = "https://www.hklii.hk/api/getjudgment?lang={LANG}&abbr={ABBR}&year={YEAR}&num={NUM}";
const HKLII_PAGE = "https://www.hklii.hk/{LANG}/cases/{ABBR}/{YEAR}/{NUM}";

function parseArgs(argv) {
  const args = {
    input: DEFAULT_INPUT,
    output: DEFAULT_INPUT,
    registry: DEFAULT_REGISTRY,
    maxCases: Infinity,
    delayMs: 125,
    dropUnconfirmed: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input") args.input = path.resolve(ROOT, argv[++i] || args.input);
    else if (arg === "--output") args.output = path.resolve(ROOT, argv[++i] || args.output);
    else if (arg === "--registry") args.registry = path.resolve(ROOT, argv[++i] || args.registry);
    else if (arg === "--max-cases") args.maxCases = Number(argv[++i] || args.maxCases);
    else if (arg === "--delay-ms") args.delayMs = Number(argv[++i] || args.delayMs);
    else if (arg === "--drop-unconfirmed") args.dropUnconfirmed = true;
  }
  return args;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function parseNeutralCitation(citation = "") {
  const match = String(citation || "").match(/^\[(\d{4})\]\s+(HK[A-Za-z]+)\s+(\d+)$/);
  if (!match) return null;
  return {
    year: match[1],
    abbr: match[2].toLowerCase(),
    num: match[3],
  };
}

function urlFromTemplate(template, values) {
  return template
    .replace("{LANG}", values.lang)
    .replace("{ABBR}", values.abbr)
    .replace("{YEAR}", values.year)
    .replace("{NUM}", values.num);
}

function paragraphNumbersFromHtml(html = "") {
  const numbers = new Set();
  for (const match of String(html || "").matchAll(/<a\s+name=["']p(\d+)["'][^>]*>/gi)) {
    numbers.add(match[1]);
  }
  for (const match of String(html || "").matchAll(/id=["']p(\d+)["']/gi)) {
    numbers.add(match[1]);
  }
  return Array.from(numbers).sort((a, b) => Number(a) - Number(b));
}

function legalRefParagraphUrl(card, paragraphNo) {
  const base = card.fetch_url || card.source_url_or_path || "";
  if (!base) return "";
  return `${base}#p${paragraphNo}`;
}

async function fetchHkliiJudgment(parsed) {
  for (const lang of ["en", "tc", "sc"]) {
    const apiUrl = urlFromTemplate(HKLII_API, { ...parsed, lang });
    const response = await fetch(apiUrl, {
      headers: {
        accept: "application/json",
        "user-agent": "Mozilla/5.0 Codex HKLII paragraph URL verifier",
      },
    });
    if (response.status === 404) continue;
    if (!response.ok) return { status: "error", lang, apiUrl, error_status: response.status };
    const data = await response.json();
    if (data?.neutral && data?.content) {
      return {
        status: "confirmed",
        lang,
        apiUrl,
        pageUrl: urlFromTemplate(HKLII_PAGE, { ...parsed, lang }),
        neutral: data.neutral,
        content: data.content,
      };
    }
  }
  return { status: "not_found" };
}

function updateRegistry(registryPath, cards) {
  if (!fs.existsSync(registryPath)) return;
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  registry.generated_at = new Date().toISOString();
  registry.counts = {
    ...(registry.counts || {}),
    recall_cards: cards.length,
    criminal_likely: cards.filter(card => card.criminal_likely).length,
    hklii_confirmed: cards.filter(card => card.hklii_crosscheck_status === "confirmed").length,
  };
  registry.cases = cards;
  writeJson(registryPath, registry);
}

async function main() {
  const args = parseArgs(process.argv);
  const payload = JSON.parse(fs.readFileSync(args.input, "utf8"));
  const cards = payload.case_recall_cards || [];
  let checked = 0;
  let confirmed = 0;
  let notFound = 0;

  for (const card of cards) {
    if (checked >= args.maxCases) break;
    const parsed = parseNeutralCitation(card.neutral_citation);
    if (!parsed) {
      card.hklii_crosscheck_status = "invalid_neutral_citation";
      continue;
    }
    checked += 1;
    const result = await fetchHkliiJudgment(parsed);
    if (result.status === "confirmed" && result.neutral === card.neutral_citation) {
      const paragraphNumbers = paragraphNumbersFromHtml(result.content);
      card.hklii_crosscheck_status = "confirmed";
      card.hklii_url = result.pageUrl;
      card.hklii_api_url = result.apiUrl;
      card.hklii_lang = result.lang;
      card.hklii_paragraph_url_count = paragraphNumbers.length;
      card.hklii_paragraph_urls = paragraphNumbers.map(paragraph_no => ({
        paragraph_no,
        hklii_url: `${result.pageUrl}#p${paragraph_no}`,
        legalref_url: legalRefParagraphUrl(card, paragraph_no),
      }));
      const existing = card.public_evidence_sources || [];
      if (!existing.some(source => source.provider === "HKLII")) {
        existing.push({
          provider: "HKLII",
          evidence_type: "public_judgment_api_and_page",
          url: result.pageUrl,
          api_url: result.apiUrl,
          neutral_citation: card.neutral_citation,
          paragraph_anchor_count: paragraphNumbers.length,
        });
      }
      card.public_evidence_sources = existing;
      confirmed += 1;
    } else {
      card.hklii_crosscheck_status = result.status === "error" ? "error" : "not_found";
      card.hklii_candidate_url = urlFromTemplate(HKLII_PAGE, { ...parsed, lang: "en" });
      notFound += 1;
    }
    if (args.delayMs > 0) await sleep(args.delayMs);
  }

  const finalCards = args.dropUnconfirmed
    ? cards.filter(card => card.hklii_crosscheck_status === "confirmed")
    : cards;
  payload.case_recall_cards = finalCards;
  payload.generated_at = new Date().toISOString();
  payload.hklii_enrichment = {
    enriched_at: new Date().toISOString(),
    checked,
    confirmed,
    not_found_or_error: notFound,
    drop_unconfirmed: args.dropUnconfirmed,
    final_card_count: finalCards.length,
  };
  writeJson(args.output, payload);
  updateRegistry(args.registry, finalCards);
  console.log(JSON.stringify({
    output: path.relative(ROOT, args.output),
    checked,
    confirmed,
    not_found_or_error: notFound,
    final_card_count: finalCards.length,
    status: "hklii_paragraph_url_enrichment_complete",
  }, null, 2));
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
