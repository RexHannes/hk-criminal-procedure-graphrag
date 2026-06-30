#!/usr/bin/env node
/* Smoke-test the PR #6 demo API contract locally or against a configured base URL. */

const fs = require("fs");
const path = require("path");
const handler = require("../api/search-evidence.js");
const { retrieveCaseLawResearch } = require("../src/legal_answer/case_corpus/case_law_research_retriever");

const ROOT = path.resolve(__dirname, "..");
const args = new Set(process.argv.slice(2));
const localOnly = args.has("--local-only") || process.env.LOCAL_ONLY === "true";
const skipNetwork = args.has("--skip-network") || process.env.SKIP_NETWORK === "true";
const baseUrl = String(process.env.DEMO_BASE_URL || "").replace(/\/+$/, "");
const errors = [];

function fail(message) {
  errors.push(message);
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function readJsonl(relativePath) {
  const text = fs.readFileSync(path.join(ROOT, relativePath), "utf8").trim();
  if (!text) return [];
  return text.split(/\n+/).filter(Boolean).map(JSON.parse);
}

function by(items, key) {
  return new Map(items.map(item => [item[key], item]));
}

function groupBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

function localPost(body) {
  return new Promise((resolve, reject) => {
    const req = { method: "POST", body };
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        if (this.statusCode >= 400) reject(new Error(`HTTP ${this.statusCode}: ${JSON.stringify(payload)}`));
        else resolve(payload);
      },
    };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

async function remotePost(body) {
  if (!baseUrl) throw new Error("DEMO_BASE_URL is required unless --local-only or SKIP_NETWORK=true is used");
  const endpoint = baseUrl.endsWith("/api/search-evidence") ? baseUrl : `${baseUrl}/api/search-evidence`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${JSON.stringify(payload)}`);
  return payload;
}

async function post(body) {
  if (localOnly || skipNetwork || !baseUrl) return localPost(body);
  return remotePost(body);
}

function paragraphProofIndexes() {
  const paragraphs = readJsonl("data/legal_ingest/case_corpus/paragraph_cards_sample_100.jsonl");
  const propositions = readJsonl("data/legal_ingest/case_corpus/proposition_cards_sample_100.jsonl");
  const principles = readJsonl("data/legal_ingest/case_corpus/principle_cards_sample_100.jsonl");
  return {
    paragraphByUrl: by(paragraphs, "source_url"),
    propositionsByParagraphId: groupBy(propositions, proposition => (proposition.source_paragraph_ids || [])[0] || ""),
    principleById: by(principles, "principle_id"),
    demotedPrinciples: principles.filter(principle => principle.principle_quality_status === "demoted" || principle.usable_in_answer_layer === false),
  };
}

function citedParagraphUrls(markdown = "") {
  return Array.from(markdown.matchAll(/https:\/\/www\.hklii\.hk\/en\/cases\/[^\s)]+#p\d+/g)).map(match => match[0]);
}

function validateParagraphProof(markdown, indexes, label) {
  const urls = citedParagraphUrls(markdown);
  if (!urls.length) {
    fail(`${label} did not cite any HKLII paragraph URL`);
    return;
  }
  for (const url of urls) {
    const paragraph = indexes.paragraphByUrl.get(url);
    if (!paragraph) {
      fail(`${label} cites URL without committed paragraph card: ${url}`);
      continue;
    }
    const propositions = indexes.propositionsByParagraphId.get(paragraph.paragraph_id) || [];
    if (!propositions.length) {
      fail(`${label} cites paragraph without proposition proof: ${paragraph.paragraph_id}`);
      continue;
    }
    const matched = propositions.some(proposition => {
      const quote = String(proposition.exact_quote_support || "").trim();
      return quote && paragraph.paragraph_text.includes(quote);
    });
    if (!matched) fail(`${label} paragraph has no matching exact_quote_support proposition: ${paragraph.paragraph_id}`);
  }
}

function validateRawResearchNoDemotedPrinciples(query, indexes) {
  const raw = retrieveCaseLawResearch({
    query: query.query,
    issue_id: query.expected_issue_id || "",
    mode: "sample",
    max_cases: 5,
    max_paragraphs: 8,
  });
  for (const item of raw.cases || []) {
    for (const principle of item.principles || []) {
      const committed = indexes.principleById.get(principle.principle_id);
      if (!committed) {
        fail(`${query.id} ${query.label} returned unknown principle ${principle.principle_id}`);
        continue;
      }
      if (committed.principle_quality_status !== "pass" || committed.usable_in_answer_layer !== true) {
        fail(`${query.id} ${query.label} returned demoted/non-usable principle as answer-layer authority: ${principle.principle_id}`);
      }
    }
  }
}

function validateAuthorityClass(markdown, label) {
  const blocked = [
    /case_recall_only/i,
    /source_candidate/i,
    /candidate_only/i,
    /\bLexis(?:Nexis)?\b/i,
    /\bWestlaw\b/i,
    /private_or_licensed/i,
    /client\s+document/i,
  ];
  for (const pattern of blocked) {
    if (pattern.test(markdown)) fail(`${label} exposed barred authority/source class: ${pattern}`);
  }
}

function validatePayload(query, payload, indexes) {
  const label = `${query.id} ${query.label}`;
  const answerMarkdown = String(payload.answer_markdown || "");
  const caseMarkdown = String(payload.case_law_research?.markdown || "");
  const combinedMarkdown = `${answerMarkdown}\n${caseMarkdown}`;
  const productMode = payload.product_mode || {};
  const audit = payload.audit_trail?.case_corpus_audit || {};

  if (!answerMarkdown.trim()) fail(`${label} missing answer-first markdown`);
  if (/^\s*[{[]/.test(answerMarkdown)) fail(`${label} answer_markdown starts as raw JSON`);
  if (answerMarkdown.trim().startsWith("```json")) fail(`${label} answer_markdown starts with JSON code fence`);
  if (answerMarkdown.indexOf("{") === 0 || answerMarkdown.indexOf("[") === 0) fail(`${label} raw JSON-first output detected`);
  if (!answerMarkdown.trim().startsWith("#")) fail(`${label} answer_markdown should start with a human-readable heading`);

  if (productMode.answer_mode !== "research_prototype") fail(`${label} expected answer_mode=research_prototype`);
  if (productMode.lawyer_review_status !== "unreviewed") fail(`${label} expected quiet lawyer_review_status=unreviewed`);
  if (productMode.professional_advice_certified !== false) fail(`${label} expected professional_advice_certified=false`);

  if (!(query.expected_product_modes || []).includes(productMode.mode)) {
    fail(`${label} unexpected product mode ${productMode.mode}; expected ${(query.expected_product_modes || []).join(", ")}`);
  }

  if (query.should_abstain) {
    if (payload.case_law_research?.cases_returned !== 0) fail(`${label} unsupported query returned case-law authorities`);
    if (!audit.abstain_reason) fail(`${label} unsupported query missing abstain reason`);
    if (/Source URL: https:\/\/www\.hklii\.hk\/en\/cases\//.test(combinedMarkdown)) fail(`${label} unsupported query cited HKLII case authority`);
    return;
  }

  if (!payload.case_law_research || payload.case_law_research.cases_returned <= 0) fail(`${label} supported query did not return case-law research`);
  if (!caseMarkdown.includes("Case-by-Case Authorities")) fail(`${label} case-law memo missing case-by-case authorities`);
  if (!caseMarkdown.includes("Source Audit")) fail(`${label} case-law memo missing source audit`);
  if (!caseMarkdown.includes("Exact quote:")) fail(`${label} case-law memo missing exact quote support`);
  if (!/research prototype/i.test(caseMarkdown)) fail(`${label} case-law memo missing research prototype boundary`);
  if (payload.case_law_research?.answer_layer_status !== "research_only") fail(`${label} case-law status is not research_only`);
  if (payload.case_law_research?.answer_mode !== "research_prototype") fail(`${label} case-law answer mode is not research_prototype`);
  if (payload.case_law_research?.professional_advice_certified !== false) fail(`${label} case-law professional certification should be false`);

  const inferred = audit.inferred_issue_ids || [];
  if (query.expected_issue_id && !inferred.includes(query.expected_issue_id)) {
    fail(`${label} did not infer expected issue ${query.expected_issue_id}; got ${inferred.join(", ")}`);
  }

  validateParagraphProof(caseMarkdown, indexes, label);
  validateRawResearchNoDemotedPrinciples(query, indexes);
  validateAuthorityClass(combinedMarkdown, label);
}

(async () => {
  const pack = readJson("artifacts/demo_outputs/demo_query_pack.json");
  const indexes = paragraphProofIndexes();
  for (const query of pack.queries || []) {
    const body = {
      query: query.query,
      use_case_corpus: true,
      case_corpus_mode: "sample",
      max_cases: 5,
      max_paragraphs: 8,
    };
    if (query.expected_issue_id) body.issue_id = query.expected_issue_id;
    const payload = await post(body);
    validatePayload(query, payload, indexes);
  }

  if (errors.length) {
    console.error("PR #6 demo API smoke test failed:");
    errors.forEach(error => console.error(`- ${error}`));
    process.exit(1);
  }
  console.log("PR #6 demo API smoke test passed.");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
