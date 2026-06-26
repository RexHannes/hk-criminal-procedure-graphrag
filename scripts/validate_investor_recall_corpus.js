#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_INPUT = path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "investor_recall", "case_recall_cards.json");

function parseArgs(argv) {
  const args = { input: DEFAULT_INPUT, minCards: 1, requireHkliiParagraphUrls: false };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--input") args.input = path.resolve(ROOT, argv[++i] || args.input);
    else if (argv[i] === "--min-cards") args.minCards = Number(argv[++i] || args.minCards);
    else if (argv[i] === "--require-hklii-paragraph-urls") args.requireHkliiParagraphUrls = true;
  }
  return args;
}

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

const args = parseArgs(process.argv);
const payload = JSON.parse(fs.readFileSync(args.input, "utf8"));
const cards = payload.case_recall_cards || [];
const errors = [];
const ids = new Set();
const disSet = new Set();
const citations = new Set();

assert(cards.length >= args.minCards, `expected at least ${args.minCards} recall cards`, errors);

for (const card of cards) {
  const id = card.recall_card_id || card.source_id;
  assert(Boolean(id), "recall card missing id", errors);
  assert(!ids.has(id), `${id}: duplicate recall id`, errors);
  ids.add(id);
  assert(Boolean(card.dis), `${id}: missing LegalRef DIS`, errors);
  assert(!disSet.has(String(card.dis)), `${id}: duplicate LegalRef DIS ${card.dis}`, errors);
  disSet.add(String(card.dis));
  assert(/^\[\d{4}\]\s+HK[A-Za-z]+\s+\d+$/.test(card.neutral_citation || ""), `${id}: neutral citation invalid`, errors);
  assert(!citations.has(card.neutral_citation), `${id}: duplicate neutral citation ${card.neutral_citation}`, errors);
  citations.add(card.neutral_citation);
  assert(/legalref\.judiciary\.hk|hklii\.hk|hklii\.org/i.test(`${card.source_url_or_path || ""} ${card.fetch_url || ""}`), `${id}: public LegalRef/HKLII URL required`, errors);
  assert(card.source_visibility === "public_demo", `${id}: source_visibility must be public_demo`, errors);
  assert(card.tenant_id === "public", `${id}: tenant_id must be public`, errors);
  assert(card.evidence_level === "case_recall_only", `${id}: evidence_level must be case_recall_only`, errors);
  assert(card.answer_layer_status === "case_recall_only", `${id}: answer_layer_status must be case_recall_only`, errors);
  assert(card.answer_safe === false, `${id}: recall cards must not be answer_safe`, errors);
  assert(Array.isArray(card.public_evidence_sources) && card.public_evidence_sources.length > 0, `${id}: public evidence source required`, errors);
  if (args.requireHkliiParagraphUrls) {
    assert(card.hklii_crosscheck_status === "confirmed", `${id}: HKLII crosscheck must be confirmed`, errors);
    assert(/^https:\/\/www\.hklii\.hk\/(en|tc|sc)\/cases\//.test(card.hklii_url || ""), `${id}: HKLII case URL required`, errors);
    assert(Array.isArray(card.hklii_paragraph_urls) && card.hklii_paragraph_urls.length > 0, `${id}: HKLII paragraph URLs required`, errors);
    for (const paragraph of card.hklii_paragraph_urls || []) {
      assert(/^p?\d+$/.test(String(paragraph.paragraph_no || "")), `${id}: bad paragraph number`, errors);
      assert((paragraph.hklii_url || "").includes(`#p${paragraph.paragraph_no}`), `${id}: HKLII paragraph URL missing anchor ${paragraph.paragraph_no}`, errors);
      assert((paragraph.legalref_url || "").includes(`#p${paragraph.paragraph_no}`), `${id}: LegalRef paragraph URL missing anchor ${paragraph.paragraph_no}`, errors);
    }
  }
}

const report = {
  validator: "investor_recall_corpus_v1",
  input: path.relative(ROOT, args.input),
  card_count: cards.length,
  criminal_likely_count: cards.filter(card => card.criminal_likely).length,
  hklii_confirmed_count: cards.filter(card => card.hklii_crosscheck_status === "confirmed").length,
  source_providers: Array.from(new Set(cards.map(card => card.source_provider).filter(Boolean))),
  status: errors.length ? "failed" : "passed",
  errors,
};

console.log(JSON.stringify(report, null, 2));
if (errors.length) process.exit(1);
