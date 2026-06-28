const { extractFacts } = require("./fact_extractor");
const { buildLegalResearchAnswer } = require("./legal_research_answer_renderer");
const { findRuleDeck } = require("./rule_card_loader");
const { conditionPasses, verifyAppliedAnalysis } = require("./verifier");

function itemIncluded(item = {}, facts = {}) {
  if (!item.include_if) return true;
  return conditionPasses(item.include_if, facts);
}

function renderSections(sections = [], facts = {}) {
  return sections
    .map(section => ({
      heading: section.heading,
      items: (section.items || [])
        .filter(item => itemIncluded(item, facts))
        .map(item => String(item.text || "").trim())
        .filter(Boolean),
    }))
    .filter(section => section.heading && section.items.length);
}

function supportFromDeck(deck, facts) {
  const answer = deck.answer_blueprint || {};
  return {
    title: answer.title || deck.title || "Applied Legal Analysis",
    short_answer: answer.short_answer || "",
    sections: renderSections(answer.sections || [], facts).map(section => [section.heading, section.items]),
    source_backed_rules: deck.source_backed_rules || [],
    missing_facts: deck.missing_facts || [],
    unsupported_claims: deck.unsupported_claims || [],
  };
}

function buildAppliedAnalysis({ domain, scenario, subscenario, query, facts: suppliedFacts } = {}) {
  const deck = findRuleDeck({ domain, scenario, subscenario });
  if (!deck) {
    return {
      matched: false,
      answer_generation_mode: "deterministic_fallback_template",
      reason: "no_rule_deck_for_scenario",
    };
  }

  const facts = suppliedFacts || extractFacts({ domain, scenario, subscenario, query });
  const support = supportFromDeck(deck, facts);
  const renderedSections = support.sections.map(([heading, items]) => ({ heading, items }));
  const appliedAnswer = deck.legal_research_answer
    ? buildLegalResearchAnswer({ deck, facts, renderedSections })
    : {
      title: support.title,
      mode: deck.answer_mode || "source_gated_applied_analysis",
      answer_generation_mode: "structured_rule_card_applied_analysis",
      llm_status: "not_invoked_token_saving",
      short_answer: support.short_answer,
      sections: renderedSections,
    };
  const verification = verifyAppliedAnalysis({ deck, facts, appliedAnswer });

  return {
    matched: true,
    rule_deck_id: deck.rule_deck_id,
    answer_generation_mode: appliedAnswer.answer_generation_mode || "structured_rule_card_applied_analysis",
    llm_status: "not_invoked_token_saving",
    facts,
    support,
    applied_answer: appliedAnswer,
    answer_contract: {
      ...(deck.answer_contract || {}),
      domain,
      scenario_family: scenario,
      subscenario,
      answer_generation_mode: appliedAnswer.answer_generation_mode || "structured_rule_card_applied_analysis",
      answer_sections: (appliedAnswer.sections || []).map(section => section.heading).filter(Boolean),
      verifier_status: verification.status,
    },
    source_backed_rules: support.source_backed_rules,
    unsupported_claims: support.unsupported_claims,
    source_audit_claims: appliedAnswer.debug_audit?.claims || [],
    debug_audit: appliedAnswer.debug_audit,
    verification,
  };
}

module.exports = {
  buildAppliedAnalysis,
  renderSections,
  supportFromDeck,
};
