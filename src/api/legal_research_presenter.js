const MEMO_HEADINGS = [
  "Short Answer",
  "Issues",
  "Governing Law / Elements",
  "Relevant Authorities",
  "Extracted Legal Principles",
  "Application to User Facts",
  "Missing Facts",
  "Practical Next Steps",
  "Source Audit",
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

function buildLegalResearchPresentation({ applied = {}, matched = [], warnings = [] } = {}) {
  const answer = applied.applied_answer || {};
  const sourceAudit = applied.source_audit || {};
  const sections = normalizeSections(answer.sections || []);
  const headings = sections.map(section => section.heading);
  const memoHeadingCoverage = MEMO_HEADINGS.filter(heading => headings.includes(heading));
  const sourceStatus = claimStatus(sourceAudit);
  const source_links = sourceLinksFromAudit(sourceAudit);

  return {
    presentation_mode: "answer_first_source_gated",
    legal_research_answer: {
      title: answer.title || "Source-Gated Legal Research Answer",
      short_answer: answer.short_answer || "",
      sections,
      memo_heading_coverage: memoHeadingCoverage,
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
    answer_markdown: buildMarkdown(answer, sections),
    audit_trail: {
      display: "collapsed",
      debug_hidden_by_default: true,
      raw_graph_matches_count: matched.length,
      source_audit_claims_count: sourceStatus.claims_count,
      warnings_count: warnings.length,
      note: "Raw doctrine matches and source-card debug data are retained for audit, but the product answer should render legal_research_answer first.",
    },
  };
}

module.exports = {
  MEMO_HEADINGS,
  buildLegalResearchPresentation,
};
