function clean(items = []) {
  return items.map(item => String(item || "").trim()).filter(Boolean);
}

function first(items = [], fallback = "") {
  return items.find(Boolean) || fallback;
}

function caseAuthorityItem(item) {
  const digest = item.digest || {};
  const paragraph = item.paragraphs?.[0] || {};
  const principle = item.principles?.[0] || {};
  const issue = item.issue_matches?.[0] || {};
  return [
    `${digest.case_name} ${digest.neutral_citation} (${digest.court}, ${digest.judgment_date}).`,
    `Facts: ${digest.facts_summary || "Not summarized."}`,
    `Issue: ${first(digest.issues, issue.issue_id || "Issue mapping pending.")}`,
    `Holding: ${first(digest.holdings, "Holding extraction pending review.")}`,
    `Key paragraph: ${paragraph.para_no ? `para. ${paragraph.para_no}` : "paragraph pending"} - ${paragraph.source_url || first(digest.hklii_paragraph_urls, digest.source_url)}`,
    `Exact quote: "${paragraph.paragraph_text ? (item.propositions?.[0]?.exact_quote_support || principle.exact_quote_support || paragraph.paragraph_text.slice(0, 140)) : "quote pending"}"`,
    `Principle: ${principle.principle_text || "Principle extraction pending review."}`,
    `Why relevant: ${issue.relevance_reason || first(digest.applies_when, "Issue-mapped relevance pending review.")}`,
    `How distinguishable: ${principle.distinguishable_when || first(digest.distinguishable_when, "Distinguishing analysis pending review.")}`,
    `Source URL: ${paragraph.source_url || first(digest.hklii_paragraph_urls, digest.source_url)}`,
  ].join(" ");
}

function evidenceItems(evidenceBundle = null) {
  if (!evidenceBundle?.uploaded_evidence_ingested) {
    return ["No uploaded evidence text was supplied for this case-corpus memo. User facts remain separate from legal authority."];
  }
  const items = [`Uploaded text evidence parsed: ${evidenceBundle.text_item_count || 0} item(s). It is fact/evidence material only, not legal authority.`];
  for (const fact of evidenceBundle.helpful_facts || []) items.push(`Helps: ${fact.text}`);
  for (const fact of evidenceBundle.harmful_facts || []) items.push(`Hurts or needs explanation: ${fact.text}`);
  for (const fact of evidenceBundle.neutral_facts || []) items.push(`Neutral/procedural: ${fact.text}`);
  return clean(items);
}

function renderCaseLawResearch({
  retrieval,
  query = "",
  evidenceBundle = null,
  unsupportedReason = "",
} = {}) {
  const cases = retrieval?.cases || [];
  const hasCases = cases.length > 0;
  const sections = [
    {
      heading: "Short Answer",
      items: hasCases
        ? ["The case-corpus layer found research-only public case authorities with paragraph proof. They may support legal research and issue spotting, but they are not answer-safe legal advice."]
        : [unsupportedReason || "No source-grounded case-corpus authority is attached for this query in the sample L1-L3.5 corpus."],
    },
    {
      heading: "Issues",
      items: hasCases
        ? clean(retrieval.inferred_issue_ids || []).map(id => `Issue mapped: ${id}`)
        : ["The query is outside the current sample case-corpus issue map, or the relevant vertical remains statute-first."],
    },
    {
      heading: "Governing Law / Elements",
      items: hasCases
        ? ["Use statute/source cards for governing elements; case-corpus cards provide paragraph-backed research context and factual application only."]
        : ["No case-corpus governing law is asserted."],
    },
    {
      heading: "Case-by-Case Authorities",
      items: hasCases
        ? cases.map(caseAuthorityItem)
        : ["No case-by-case authority is attached in the sample L1-L3.5 corpus."],
    },
    {
      heading: "Extracted Legal Principles",
      items: hasCases
        ? cases.flatMap(item => item.principles || []).map(principle => `${principle.principle_text} Quote: "${principle.exact_quote_support}". Status: ${principle.answer_layer_status}; review: ${principle.review_status}.`)
        : ["No extracted case principle is available for this query."],
    },
    {
      heading: "Application to User Facts",
      items: hasCases
        ? ["Apply the extracted principles only as research triage: compare the user's facts against the paragraph quote, the digest facts, and the distinguishability limits before any advice."]
        : ["No case-law application is made because the sample corpus has no mapped authority for this query."],
    },
    {
      heading: "Evidence Analysis",
      items: evidenceItems(evidenceBundle),
    },
    {
      heading: "Missing Facts",
      items: hasCases
        ? ["Current treatment check for each case.", "Full factual record, charge/procedural posture and source review.", "Lawyer review before any answer-safe proposition."]
        : ["Supported issue id, paragraph proof, proposition/principle extraction and lawyer review."],
    },
    {
      heading: "Practical Next Steps",
      items: hasCases
        ? ["Review the paragraph cards against HKLII/LegalRef.", "Check current treatment before relying on the case.", "Do not promote machine candidates to answer-safe without lawyer review."]
        : ["Build or load a source-grounded vertical pack before answering.", "Do not cite case law as authority without paragraph cards and exact quote support."],
    },
    {
      heading: "Source Audit",
      items: [
        `L1 registry cases: ${retrieval?.audit?.registry_case_count || 0}`,
        `L2 paragraph cards: ${retrieval?.audit?.paragraph_card_count || 0}`,
        `L3 propositions/principles: ${(retrieval?.audit?.proposition_card_count || 0) + (retrieval?.audit?.principle_card_count || 0)}`,
        `L3.5 digests returned: ${cases.length}`,
        "L4 answer-safe propositions: not implemented.",
        "All case-corpus outputs are research_only / lawyer_review_required.",
      ],
    },
  ];

  const title = hasCases ? "L1-L3.5 Case-Law Research Memo" : "Unsupported Case-Corpus Research Query";
  const markdown = [
    `# ${title}`,
    "",
    ...sections.flatMap(section => [
      `## ${section.heading}`,
      ...(section.items.length ? section.items.map(item => `- ${item}`) : ["- No source-backed item is currently attached."]),
      "",
    ]),
  ].join("\n").trim() + "\n";

  return {
    presentation_mode: "case_corpus_l1_l35_research_only",
    title,
    query,
    sections,
    markdown,
    cases_returned: cases.length,
    answer_layer_status: "research_only",
    review_status: "lawyer_review_required",
    l4_answer_safe_implemented: false,
  };
}

module.exports = {
  renderCaseLawResearch,
};
