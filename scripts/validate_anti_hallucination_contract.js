#!/usr/bin/env node
/* Guardrails for source-gated answer generation and display. */

const handler = require("../api/search-evidence.js");
const { loadResearchCards } = require("../src/legal_answer/applied_analysis/research_card_store");

function run(queryOrBody) {
  return new Promise((resolve, reject) => {
    const req = {
      method: "POST",
      body: typeof queryOrBody === "string" ? { query: queryOrBody } : queryOrBody,
    };
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

function headings(payload) {
  return (payload.legal_research_answer?.sections || []).map(section => section.heading);
}

function sectionText(payload, heading) {
  const section = (payload.legal_research_answer?.sections || []).find(item => item.heading === heading);
  return blob(section || {});
}

function validateNoRawJson(label, payload, errors) {
  const markdown = String(payload.answer_markdown || "");
  for (const forbidden of ["matched_doctrine_nodes", "\"source_card_id\"", "\"paragraph_id\"", "\"doctrine_node_id\""]) {
    assert(!markdown.includes(forbidden), `${label}: raw JSON leaked into answer markdown: ${forbidden}`, errors);
  }
}

function validateSourceRules(label, payload, cards, errors) {
  for (const rule of payload.source_backed_rules || []) {
    assert((rule.source_card_ids || []).length >= 1, `${label}/${rule.id}: source_card_ids missing`, errors);
    for (const sourceId of rule.source_card_ids || []) {
      const source = cards.sourceById.get(sourceId);
      assert(source, `${label}/${rule.id}: missing source card ${sourceId}`, errors);
      assert(source?.official_url?.startsWith("https://"), `${label}/${sourceId}: official URL missing`, errors);
      if (source?.source_kind === "case_judgment") {
        assert(source.hklii_url?.includes("#p"), `${label}/${sourceId}: case source lacks paragraph URL`, errors);
      }
    }
    assert(!String(rule.verification_status || "").includes("answer_safe"), `${label}/${rule.id}: rule auto-promoted answer_safe`, errors);
  }
}

function validateCasePrinciples(cards, errors) {
  for (const principle of cards.principle_cards || []) {
    if (principle.source_type !== "case") continue;
    assert((principle.paragraph_card_ids || []).length >= 1, `${principle.principle_id}: case principle lacks paragraph_card_ids`, errors);
    for (const paragraphId of principle.paragraph_card_ids || []) {
      const paragraph = cards.paragraphById.get(paragraphId);
      assert(paragraph, `${principle.principle_id}: missing paragraph card ${paragraphId}`, errors);
      assert(paragraph?.source_url?.includes(`#p${paragraph?.para_no}`), `${paragraphId}: paragraph URL anchor mismatch`, errors);
    }
  }
}

function validateAnswer(label, payload, cards, errors) {
  const headingList = headings(payload);
  assert(payload.product_mode?.needs_lawyer_review === true, `${label}: missing needs_lawyer_review`, errors);
  assert(payload.product_mode?.answer_safe === false, `${label}: answer_safe must be false`, errors);
  assert(payload.legal_research_answer?.source_status?.case_recall_only_allowed_as_answer_authority === false, `${label}: recall-only authority not blocked`, errors);
  assert(!blob({
    markdown: payload.answer_markdown,
    sections: payload.legal_research_answer?.sections,
  }).includes("case_recall_only"), `${label}: recall-only leaked into memo`, errors);
  assert(headingList.includes("Application to User Facts"), `${label}: missing Application to User Facts`, errors);
  assert(headingList.includes("Evidence Analysis"), `${label}: missing Evidence Analysis`, errors);
  assert(sectionText(payload, "Application to User Facts").length > 40, `${label}: application section too thin`, errors);
  assert(payload.audit_trail?.evidence_source_audit?.display === "collapsed", `${label}: evidence source audit not separated`, errors);
  validateNoRawJson(label, payload, errors);
  validateSourceRules(label, payload, cards, errors);
}

function validateUploadedEvidence(payload, errors) {
  const evidenceAudit = payload.audit_trail?.evidence_source_audit || {};
  assert(evidenceAudit.uploaded_evidence_ingested === true, "uploaded evidence: evidence text was not ingested", errors);
  assert(evidenceAudit.text_item_count >= 2, "uploaded evidence: expected at least two parsed text items", errors);
  assert((evidenceAudit.source_kinds || []).includes("cctv_or_video_transcript"), "uploaded evidence: CCTV transcript source kind missing", errors);
  assert((evidenceAudit.source_kinds || []).includes("receipt_or_payment_record"), "uploaded evidence: receipt/payment source kind missing", errors);
  assert(payload.evidence_ingest_summary?.uploaded_evidence_ingested === true, "uploaded evidence: summary not exposed", errors);
  assert(payload.product_mode?.answer_safe === false, "uploaded evidence must not make answer_safe true", errors);
  assert(payload.product_mode?.uploaded_evidence_mode === "text_evidence_research_triage_only", "uploaded evidence: product mode not research-only", errors);
  const evidenceText = sectionText(payload, "Evidence Analysis");
  assert(evidenceText.includes("uploaded evidence") && evidenceText.includes("helps"), "uploaded evidence: helpful evidence not rendered", errors);
  assert(evidenceText.includes("hurts") || evidenceText.includes("needs explanation"), "uploaded evidence: harmful evidence not rendered", errors);
  assert(evidenceText.includes("not legal authority"), "uploaded evidence: authority boundary missing", errors);
  assert(!/no uploaded .* parsed/.test(evidenceText), "uploaded evidence: contradictory no-uploaded-evidence text rendered", errors);
}

(async () => {
  const errors = [];
  const cards = loadResearchCards();
  validateCasePrinciples(cards, errors);

  const theft = await run("If I am alleged to be stealing something in the convenience store, but I forgot to pay and security stopped me.");
  const probate = await run("If my father dies in US and does not have will, now left a son, a daughter and 2 grandaughter; the former 18 the later not; what happens?");
  const unsupported = await run("Can my landlord increase rent for my Hong Kong flat next month?");
  const theftWithEvidence = await run({
    query: "If I am alleged to be shoplifting but I forgot to pay, can the CCTV and receipt help?",
    evidence_items: [
      {
        name: "CCTV transcript",
        source_kind: "cctv",
        text: "CCTV shows the item was visible in the basket at checkout, but the person then exited and security stopped them after leaving without paying.",
      },
      {
        name: "Receipt",
        source_kind: "receipt",
        text: "Receipt shows the person paid for other items by Octopus and says they forgot the unpaid item during a phone call distraction.",
      },
    ],
  });

  validateAnswer("theft", theft, cards, errors);
  validateAnswer("theft_with_uploaded_evidence", theftWithEvidence, cards, errors);
  validateAnswer("probate", probate, cards, errors);
  validateAnswer("unsupported", unsupported, cards, errors);
  validateUploadedEvidence(theftWithEvidence, errors);

  assert(theft.product_mode?.mode === "demo_supported", "theft should be demo_supported", errors);
  assert(probate.product_mode?.mode === "demo_supported", "probate should be demo_supported", errors);
  assert(unsupported.product_mode?.mode === "unsupported_general_query", "unsupported query must not be presented as general HK law", errors);
  assert(!new Set((theft.matched_doctrine_nodes || []).map(node => node.domain_id)).has("tort_law_hk"), "theft leaked tort nodes", errors);
  assert(sectionText(theft, "Case-by-Case Authorities").includes("key paragraph"), "theft lacks case-by-case key paragraph display", errors);
  assert(sectionText(theft, "Evidence Analysis").includes("helps") && sectionText(theft, "Evidence Analysis").includes("hurts"), "theft lacks helpful/harmful evidence mapping", errors);

  if (errors.length) {
    console.error("Anti-hallucination contract validation failed:");
    errors.forEach(error => console.error(`- ${error}`));
    process.exit(1);
  }

  console.log("Anti-hallucination contract validation passed.");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
