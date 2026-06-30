const { evidenceBundleToMemoItems } = require("./evidence_text_ingest");

const MEMO_HEADINGS = [
  "Short Answer",
  "Issues",
  "Governing Law / Elements",
  "Relevant Authorities",
  "Case-by-Case Authorities",
  "Extracted Legal Principles",
  "Application to User Facts",
  "Evidence Analysis",
  "Missing Facts",
  "Practical Next Steps",
  "Source Audit",
];

const DEMO_VERTICALS = [
  {
    domain: "probate_law_hk",
    scenario: "intestate_administration",
    subscenario: "intestacy_distribution_issue_statutory_trusts",
  },
  {
    domain: "criminal_law",
    scenario: "theft_property_dishonesty",
    subscenario: "shoplifting_forgot_to_pay_mr_defence",
  },
];

function cleanItems(items = []) {
  return items.map(item => String(item || "").trim()).filter(Boolean);
}

function normalizeSections(sections = []) {
  return sections
    .filter(section => section && section.heading)
    .map(section => ({
      heading: String(section.heading),
      items: cleanItems(section.items || []),
    }));
}

function claimStatus(sourceAudit = {}) {
  const claims = sourceAudit.claims || sourceAudit.debug_audit?.claims || [];
  const unsupported = claims.filter(claim => /unsupported|problem|missing/i.test(String(claim.status || "")));
  return {
    claims_count: claims.length,
    unsupported_claims_count: unsupported.length,
    statuses: Array.from(new Set(claims.map(claim => claim.status).filter(Boolean))).sort(),
  };
}

function sourceLinksFromAudit(sourceAudit = {}) {
  const debug = sourceAudit.debug_audit || {};
  const sourceCards = (debug.source_cards || []).flatMap(card => [
    card.official_url,
    card.hklii_url,
    card.hklii_api_url,
  ]);
  const caseDigestLinks = (debug.case_digest_cards || []).flatMap(card => [
    card.source_url,
    card.legalref_url,
    ...(card.hklii_paragraph_urls || []),
  ]);
  const principleLinks = (debug.principle_cards || []).flatMap(card => [
    card.paragraph_url,
    card.source_url,
  ]);
  return Array.from(new Set(sourceCards.concat(caseDigestLinks, principleLinks).filter(Boolean))).sort();
}

function isDemoSupported(applied = {}) {
  const contract = applied.answer_contract || {};
  const classification = applied.classification || {};
  return DEMO_VERTICALS.some(vertical => (
    vertical.domain === (contract.domain || classification.practice_area || classification.matter_type) &&
    vertical.scenario === (contract.scenario_family || classification.scenario) &&
    vertical.subscenario === (contract.subscenario || classification.subscenario)
  ));
}

function buildProductMode({ applied = {}, legalIngestBundle = null, uploadedEvidenceBundle = null } = {}) {
  const classification = applied.classification || {};
  const sourceRules = applied.source_backed_rules || [];
  const sourceAudit = applied.source_audit || {};
  const unsupportedGeneral = classification.scenario === "professional_generic_legal_analysis" || (
    classification.matter_type === "general_legal_research" &&
    !sourceRules.length &&
    !legalIngestBundle
  );
  let mode = "unsupported_general_query";
  if (isDemoSupported(applied)) mode = "demo_supported";
  else if (!unsupportedGeneral && (legalIngestBundle || sourceRules.length || /quote_verified|source_verified/.test(String(sourceAudit.verification_status || "")))) {
    mode = "source_grounded_research_only";
  }
  return {
    mode,
    labels: Array.from(new Set([
      mode,
      mode === "unsupported_general_query" ? "unsupported_general_query" : "source_grounded_research_only",
      "needs_lawyer_review",
    ])),
    needs_lawyer_review: true,
    answer_safe: false,
    supported_demo_vertical: mode === "demo_supported",
    unsupported_reason: mode === "unsupported_general_query"
      ? "This query is outside the two source-gated demo verticals unless a separate verified vertical bundle is loaded."
      : "",
    layer_order: [
      "legal_research_case_law_analysis",
      "reusable_sop_playbook",
      "forms_document_pack",
    ],
    forms_and_sops_policy: "forms and SOPs are downstream of legal issue/authority classification",
    uploaded_evidence_mode: uploadedEvidenceBundle?.uploaded_evidence_ingested
      ? "text_evidence_research_triage_only"
      : "no_uploaded_evidence_parsed",
  };
}

function unsupportedSections() {
  return [
    {
      heading: "Short Answer",
      items: ["This query is outside the currently source-gated demo verticals unless a separate verified vertical bundle is loaded. Treat this as unsupported general research orientation only, not a general HK legal AI answer."],
    },
    {
      heading: "Issues",
      items: ["The legal issue, field, procedural posture and relief have not been source-grounded by a registered vertical pack."],
    },
    {
      heading: "Governing Law / Elements",
      items: ["No governing law or element test is treated as established for this unsupported query."],
    },
    {
      heading: "Relevant Authorities",
      items: ["No verified statute, public judgment or practice-direction source card is attached for this unsupported query."],
    },
    {
      heading: "Case-by-Case Authorities",
      items: ["No case-by-case authority is attached; do not cite case law until paragraph cards and digest cards are verified."],
    },
    {
      heading: "Extracted Legal Principles",
      items: ["No extracted legal principle is answer authority for this unsupported query."],
    },
    {
      heading: "Application to User Facts",
      items: ["The user's facts should be mapped to issues only after a supported vertical exists. At present, any application would be speculative."],
    },
    {
      heading: "Evidence Analysis",
      items: ["No uploaded evidence has been parsed. Keep user facts, document evidence, legal authorities and AI inference separate."],
    },
    {
      heading: "Missing Facts",
      items: ["Supported field/vertical, procedural posture, relevant documents, official sources, paragraph proof and lawyer review status."],
    },
    {
      heading: "Practical Next Steps",
      items: ["Route the query to a supported vertical or create a source-grounded vertical pack before answering.", "Add official source cards, paragraph cards where cases are used, issue tags and golden queries before final advice."],
    },
    {
      heading: "Source Audit",
      items: ["Product mode: unsupported_general_query.", "No final legal proposition is source-grounded by this response.", "Forms and SOPs are downstream and are not recommended for this unsupported query."],
    },
    {
      heading: "Documents / Forms",
      items: ["No document pack is recommended for this unsupported query."],
    },
  ];
}

function buildMarkdown(answer = {}, sections = []) {
  const lines = [];
  if (answer.title) lines.push(`# ${answer.title}`);
  if (answer.short_answer) lines.push("", "## Short Answer", answer.short_answer);
  for (const section of sections) {
    if (section.heading === "Short Answer" && answer.short_answer) continue;
    lines.push("", `## ${section.heading}`);
    if (section.items.length) {
      for (const item of section.items) lines.push(`- ${item}`);
    } else {
      lines.push("- No source-backed item is currently attached.");
    }
  }
  return `${lines.join("\n").trim()}\n`;
}

function mergeEvidenceAnalysis(sections = [], uploadedEvidenceBundle = null) {
  const evidenceItems = evidenceBundleToMemoItems(uploadedEvidenceBundle || {});
  if (!evidenceItems.length) return sections;
  const hasParsedEvidence = Boolean(uploadedEvidenceBundle?.uploaded_evidence_ingested);
  let found = false;
  const merged = sections.map(section => {
    if (section.heading !== "Evidence Analysis") return section;
    found = true;
    const baseItems = hasParsedEvidence
      ? (section.items || []).filter(item => !/no uploaded .* parsed|no uploaded evidence has been parsed/i.test(String(item || "")))
      : section.items || [];
    return {
      ...section,
      items: cleanItems([...baseItems, ...evidenceItems]),
    };
  });
  if (!found) {
    merged.push({
      heading: "Evidence Analysis",
      items: evidenceItems,
    });
  }
  return merged;
}

function buildLegalResearchPresentation({ applied = {}, matched = [], warnings = [], legalIngestBundle = null, uploadedEvidenceBundle = null } = {}) {
  const answer = applied.applied_answer || {};
  const sourceAudit = applied.source_audit || {};
  const sourceStatus = claimStatus(sourceAudit);
  const source_links = sourceLinksFromAudit(sourceAudit);
  const product_mode = buildProductMode({ applied, legalIngestBundle, uploadedEvidenceBundle });
  const displayAnswer = product_mode.mode === "unsupported_general_query"
    ? {
        ...answer,
        title: "Unsupported General Query - Source Verification Required",
        short_answer: "This query is outside the currently source-gated demo verticals unless a separate verified vertical bundle is loaded. Treat this as unsupported general research orientation only, not final HK legal advice.",
      }
    : answer;
  const baseSections = product_mode.mode === "unsupported_general_query"
    ? unsupportedSections()
    : normalizeSections(answer.sections || []);
  const sections = mergeEvidenceAnalysis(baseSections, uploadedEvidenceBundle);
  const headings = sections.map(section => section.heading);
  const memoHeadingCoverage = MEMO_HEADINGS.filter(heading => headings.includes(heading));

  return {
    presentation_mode: "answer_first_source_gated",
    product_mode,
    legal_research_answer: {
      title: displayAnswer.title || "Source-Gated Legal Research Answer",
      short_answer: displayAnswer.short_answer || "",
      sections,
      memo_heading_coverage: memoHeadingCoverage,
      product_mode,
      product_layers: answer.product_layers || [],
      source_links,
      source_status: {
        display: "source_audit_collapsed",
        verification_status: sourceAudit.verification_status || "research_only",
        answer_layer_status: answer.answer_generation_mode || answer.mode || "research_only",
        review_status: sourceAudit.review_status || "lawyer_review_required",
        case_recall_only_allowed_as_answer_authority: false,
        ...sourceStatus,
      },
      debug_hidden_by_default: true,
    },
    answer_markdown: buildMarkdown(displayAnswer, sections),
    audit_trail: {
      display: "collapsed",
      debug_hidden_by_default: true,
      legal_source_audit: {
        display: "collapsed",
        claims_count: sourceStatus.claims_count,
        verification_status: sourceAudit.verification_status || "research_only",
      },
      evidence_source_audit: {
        display: "collapsed",
        uploaded_evidence_ingested: Boolean(uploadedEvidenceBundle?.uploaded_evidence_ingested),
        status: uploadedEvidenceBundle?.status || "no_uploaded_evidence",
        evidence_item_count: uploadedEvidenceBundle?.evidence_item_count || 0,
        text_item_count: uploadedEvidenceBundle?.text_item_count || 0,
        unparsed_item_count: uploadedEvidenceBundle?.unparsed_item_count || 0,
        source_kinds: uploadedEvidenceBundle?.source_kinds || [],
        issue_tags: uploadedEvidenceBundle?.issue_tags || [],
        evidence_items: uploadedEvidenceBundle?.evidence_items || [],
        note: uploadedEvidenceBundle?.uploaded_evidence_ingested
          ? "Text/transcript evidence was parsed for research triage only. It is not legal authority and is separated from statute/case sources."
          : "No uploaded evidence text parser input was supplied; user facts are separated from legal authorities.",
      },
      user_fact_audit: {
        display: "collapsed",
        facts_source: uploadedEvidenceBundle?.uploaded_evidence_ingested
          ? "user_query_structured_fact_extractor_and_uploaded_text_evidence"
          : "user_query_and_structured_fact_extractor",
      },
      inference_audit: {
        display: "collapsed",
        llm_status: answer.llm_status || "not_invoked_or_not_reported",
        answer_generation_mode: answer.answer_generation_mode || answer.mode || "research_only",
      },
      raw_graph_matches_count: matched.length,
      source_audit_claims_count: sourceStatus.claims_count,
      warnings_count: warnings.length,
      note: "Raw doctrine matches and source-card debug data are retained for audit, but the product answer should render legal_research_answer first.",
    },
  };
}

module.exports = {
  MEMO_HEADINGS,
  buildProductMode,
  buildLegalResearchPresentation,
};
