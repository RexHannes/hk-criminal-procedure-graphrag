#!/usr/bin/env node
/* Validate that the inquiry API is usable as an answer-first legal RAG surface. */

const fs = require("fs");
const path = require("path");
const handler = require("../api/search-evidence.js");
const { MEMO_HEADINGS } = require("../src/api/legal_research_presenter");

const ROOT = path.resolve(__dirname, "..");

function run(query) {
  return new Promise((resolve, reject) => {
    const req = { method: "POST", body: { query } };
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

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

function blob(value) {
  return JSON.stringify(value || {}).toLowerCase();
}

function validateAnswerFirstPayload(label, payload, errors) {
  const keys = Object.keys(payload);
  const answerIndex = keys.indexOf("legal_research_answer");
  const graphIndex = keys.indexOf("matched_doctrine_nodes");
  const memo = payload.legal_research_answer || {};
  const headings = (memo.sections || []).map(section => section.heading);
  const markdown = String(payload.answer_markdown || "");

  assert(payload.presentation_mode === "answer_first_source_gated", `${label}: wrong presentation mode`, errors);
  assert(payload.product_mode?.needs_lawyer_review === true, `${label}: missing lawyer-review product mode`, errors);
  assert(answerIndex >= 0, `${label}: missing legal_research_answer`, errors);
  assert(graphIndex >= 0, `${label}: missing matched_doctrine_nodes audit payload`, errors);
  assert(answerIndex < graphIndex, `${label}: answer must precede graph matches in API payload`, errors);
  assert(payload.audit_trail?.display === "collapsed", `${label}: audit_trail should be collapsed`, errors);
  assert(payload.audit_trail?.legal_source_audit?.display === "collapsed", `${label}: missing separated legal source audit`, errors);
  assert(payload.audit_trail?.evidence_source_audit?.uploaded_evidence_ingested === false, `${label}: uploaded evidence audit should be explicit`, errors);
  assert(payload.audit_trail?.debug_hidden_by_default === true, `${label}: debug should be hidden by default`, errors);
  assert(memo.debug_hidden_by_default === true, `${label}: memo debug flag missing`, errors);
  assert(memo.source_status?.case_recall_only_allowed_as_answer_authority === false, `${label}: recall-only authority must be forbidden`, errors);
  if (payload.product_mode?.mode !== "unsupported_general_query") {
    assert((memo.source_links || []).some(url => /^https:\/\//.test(url)), `${label}: source links missing`, errors);
  }
  assert(markdown.includes("## Short Answer"), `${label}: markdown missing Short Answer`, errors);
  for (const heading of MEMO_HEADINGS) {
    assert(headings.includes(heading), `${label}: missing memo heading ${heading}`, errors);
  }
  assert(!markdown.includes("matched_doctrine_nodes"), `${label}: markdown leaks raw graph field`, errors);
  assert(!markdown.includes("\"doctrine_node_id\""), `${label}: markdown leaks raw doctrine JSON`, errors);
  assert(!markdown.includes("\"source_card_id\""), `${label}: markdown leaks raw source-card JSON`, errors);

  const applicationIndex = headings.indexOf("Application to User Facts");
  const evidenceIndex = headings.indexOf("Evidence Analysis");
  const formsIndex = headings.indexOf("Documents / Forms");
  if (formsIndex >= 0) {
    assert(applicationIndex >= 0 && formsIndex > applicationIndex, `${label}: forms must be downstream of fact application`, errors);
  }
  assert(evidenceIndex > applicationIndex, `${label}: Evidence Analysis should follow fact application`, errors);
}

function validateViewerWiring(errors) {
  const app = fs.readFileSync(path.join(ROOT, "viewer", "app.js"), "utf8");
  const css = fs.readFileSync(path.join(ROOT, "viewer", "styles.css"), "utf8");
  assert(app.includes("renderLegalResearchAnswer"), "viewer does not render legal_research_answer first", errors);
  assert(app.includes("Underlying retrieval / graph matches"), "viewer does not collapse graph matches", errors);
  assert(app.includes("renderInlineText"), "viewer does not link source URLs", errors);
  assert(css.includes(".research-answer"), "viewer CSS missing research answer surface", errors);
}

(async () => {
  const errors = [];
  const probate = await run("If my father dies in US and does not have will, now left a son, a daughter and 2 grandaughter; the former 18 the later not; what happens?");
  const theft = await run("If I am alleged to be stealing something in the convenience store, but I try to argue I just forgot to pay");

  validateAnswerFirstPayload("probate", probate, errors);
  validateAnswerFirstPayload("theft", theft, errors);
  assert(probate.product_mode?.mode === "demo_supported", "probate should be demo_supported", errors);
  assert(theft.product_mode?.mode === "demo_supported", "theft should be demo_supported", errors);

  const probateText = blob({
    markdown: probate.answer_markdown,
    links: probate.legal_research_answer?.source_links,
  });
  assert(probateText.includes("elegislation.gov.hk/hk/cap73/s5"), "probate answer missing Cap. 73 s.5 official URL", errors);
  assert(probateText.includes("elegislation.gov.hk/hk/cap410/s2"), "probate answer missing Cap. 410 s.2 official URL", errors);
  assert(
    probateText.includes("no public hklii/legalref probate paragraph authority") ||
      probateText.includes("no probate case proposition is answer-safe"),
    "probate answer should state no attached answer-safe probate case paragraph authority",
    errors
  );

  const theftText = blob({
    markdown: theft.answer_markdown,
    links: theft.legal_research_answer?.source_links,
  });
  assert(theftText.includes("elegislation.gov.hk/hk/cap210/s2"), "theft answer missing Cap. 210 s.2 official URL", errors);
  assert(theftText.includes("hklii.hk/en/cases/hkcfa/2022/7#p148"), "theft answer missing Chan Kam Ching paragraph URL", errors);
  assert(theftText.includes("hklii.hk/en/cases/hkcfi/2022/1220#p24"), "theft answer missing Khan Altaf paragraph URL", errors);
  assert(theftText.includes("case 1:") && theftText.includes("facts:") && theftText.includes("how distinguishable:"), "theft answer missing case-by-case authority analysis", errors);
  assert(theftText.includes("evidence analysis") && theftText.includes("helps") && theftText.includes("hurts"), "theft answer missing evidence/fact helpful-harmful analysis", errors);
  assert(theftText.includes("forgot"), "theft answer missing forgot-to-pay application", errors);
  assert(theftText.includes("ivey") && theftText.includes("unsupported"), "theft answer missing unsupported Ivey/Ghosh caveat", errors);

  const unsupported = await run("Can my landlord increase rent for my Hong Kong flat next month?");
  validateAnswerFirstPayload("unsupported", unsupported, errors);
  assert(unsupported.product_mode?.mode === "unsupported_general_query", "random HK law query should be unsupported_general_query", errors);
  assert(blob(unsupported.answer_markdown).includes("outside the currently source-gated demo verticals"), "unsupported answer should not look like general HK legal advice", errors);

  validateViewerWiring(errors);

  if (errors.length) {
    console.error("Answer-first legal RAG validation failed:");
    errors.forEach(error => console.error(`- ${error}`));
    process.exit(1);
  }

  console.log("Answer-first legal RAG validation passed.");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
