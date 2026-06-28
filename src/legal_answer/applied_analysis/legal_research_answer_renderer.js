const { loadResearchCards, pickCards, sourceCardStatus } = require("./research_card_store");

const REQUIRED_HEADINGS = [
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

function fallbackApplicationItems(renderedSections = []) {
  return renderedSections.flatMap(section => {
    const heading = String(section.heading || "").toLowerCase();
    if (!/(application|analysis|defence|ar \/ mr|minor|distribution|evidence)/.test(heading)) return [];
    return section.items || [];
  });
}

function authorityItems(caseDigests, sourceCards, note) {
  const caseItems = caseDigests.map(card => {
    const para = (card.hklii_paragraph_urls || [])[0] || card.source_url;
    return `${card.case_name} ${card.citation}: ${card.holdings?.[0] || card.facts_summary} Source: ${para}`;
  });
  const statuteItems = sourceCards
    .filter(card => card.source_kind === "legislation")
    .map(card => `${card.title}. Source: ${card.official_url}`);
  return cleanItems([note, ...caseItems, ...statuteItems]);
}

function principleItems(principleCards) {
  return principleCards.map(card => (
    `${card.principle_text} Source: ${card.paragraph_or_section}; quote: "${card.exact_quote}". Status: ${card.answer_layer_status}.`
  ));
}

function buildClaims(deck = {}, sourceById) {
  const claims = [];
  for (const rule of deck.source_backed_rules || []) {
    const sourceIds = rule.source_card_ids || [];
    const sourceStatuses = sourceIds.map(id => ({
      source_card_id: id,
      status: sourceCardStatus(sourceById.get(id)),
    }));
    const hasBadSource = sourceStatuses.some(item => item.status === "missing_source_card" || item.status === "checksum_mismatch");
    claims.push({
      claim_id: rule.id,
      claim: rule.proposition,
      status: hasBadSource ? "source_card_problem" : rule.claim_status || "source_verified_research_only",
      source_card_ids: sourceIds,
      proposition_card_ids: rule.proposition_card_ids || [],
      unsupported_reason: "",
      source_statuses: sourceStatuses,
    });
  }
  for (const [index, claim] of (deck.unsupported_claims || []).entries()) {
    claims.push({
      claim_id: `unsupported_${index + 1}`,
      claim,
      status: "unsupported_or_not_yet_answer_safe",
      source_card_ids: [],
      proposition_card_ids: [],
      unsupported_reason: claim,
      source_statuses: [],
    });
  }
  return claims;
}

function buildLegalResearchAnswer({ deck = {}, facts = {}, renderedSections = [] } = {}) {
  const cards = loadResearchCards();
  const config = deck.legal_research_answer || {};
  const sourceCards = pickCards(config.source_card_ids || [], cards.sourceById);
  const principleCards = pickCards(config.principle_card_ids || [], cards.principleById);
  const caseDigests = pickCards(config.case_digest_card_ids || [], cards.caseDigestById);
  const claims = buildClaims(deck, cards.sourceById);
  const applicationItems = cleanItems(config.application_items || fallbackApplicationItems(renderedSections));
  const sections = [
    { heading: "Short Answer", items: cleanItems([deck.answer_blueprint?.short_answer || ""]) },
    { heading: "Issues", items: cleanItems(config.issue_items || []) },
    { heading: "Governing Law / Elements", items: cleanItems(config.governing_law_items || []) },
    { heading: "Relevant Authorities", items: authorityItems(caseDigests, sourceCards, config.relevant_authorities_note) },
    { heading: "Extracted Legal Principles", items: principleItems(principleCards) },
    { heading: "Application to User Facts", items: applicationItems },
    { heading: "Missing Facts", items: cleanItems(deck.missing_facts || []) },
    { heading: "Practical Next Steps", items: cleanItems(config.practical_next_steps || []) },
    {
      heading: "Source Audit",
      items: claims.map(claim => `${claim.claim_id}: ${claim.status}${claim.source_card_ids.length ? ` (${claim.source_card_ids.join(", ")})` : ""}`),
    },
  ];
  return {
    title: config.title || deck.answer_blueprint?.title || deck.title || "Legal Research Answer",
    mode: deck.answer_mode || "source_gated_legal_research_answer",
    answer_generation_mode: "legal_research_answer_layer",
    llm_status: "not_invoked_token_saving",
    short_answer: deck.answer_blueprint?.short_answer || "",
    sections,
    source_card_ids: sourceCards.map(card => card.source_card_id),
    principle_card_ids: principleCards.map(card => card.principle_id),
    case_digest_card_ids: caseDigests.map(card => card.case_digest_card_id),
    facts_used: facts,
    debug_audit: {
      display: "collapsed",
      claims,
      source_cards: sourceCards,
      principle_cards: principleCards,
      case_digest_cards: caseDigests,
    },
  };
}

module.exports = {
  REQUIRED_HEADINGS,
  buildClaims,
  buildLegalResearchAnswer,
};
