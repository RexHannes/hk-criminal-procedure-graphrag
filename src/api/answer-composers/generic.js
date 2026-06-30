function detectsInconsistentPleadings(query) {
  const q = String(query || "").toLowerCase();
  return (
    /\b(inconsistent|contradictory|diametrically opposed|opposite|different version|different versions)\b/.test(q) &&
    /\b(pleading|pleadings|statement|statements|affidavit|affirmation|proceeding|proceedings|case|cases|action|actions)\b/.test(q)
  ) || /\b(abuse of process|estoppel|collateral attack|res judicata|henderson)\b/.test(q);
}

function sourceLabel(card) {
  return [card.citation, card.pinpoint, card.proposition_id].filter(Boolean).join(" · ");
}

function formLabel(form) {
  return `${form.title} (${form.form_id})`;
}

function cardsByIssue(bundle, issue) {
  return (bundle?.proposition_cards || []).filter(card => (card.issue_tags || []).includes(issue));
}

function firstCard(bundle, issue) {
  return cardsByIssue(bundle, issue)[0] || null;
}

function cardById(bundle, propositionId) {
  return (bundle?.proposition_cards || []).find(card => card.proposition_id === propositionId) || null;
}

function professionalInconsistentPleadingsAnswer(query, legalIngestBundle = null) {
  const abuseCard = cardById(legalIngestBundle, "prop_inconsistent_positions_scope_minloy_p31") || firstCard(legalIngestBundle, "abuse_of_process");
  const estoppelCard = cardById(legalIngestBundle, "prop_abuse_estoppel_lancom_p43") || firstCard(legalIngestBundle, "estoppel");
  const diametricCard = cardById(legalIngestBundle, "prop_diametrically_opposed_integrity_vasily_p39") || firstCard(legalIngestBundle, "diametrically_opposed_positions");
  const alternativeCard = cardById(legalIngestBundle, "prop_alternative_pleading_within_knowledge_liu_p16") || firstCard(legalIngestBundle, "alternative_pleading");
  const summaryJudgmentCard = cardById(legalIngestBundle, "prop_summary_judgment_material_deviation_shinyei_p19") || firstCard(legalIngestBundle, "summary_judgment");
  const hendersonCard = cardById(legalIngestBundle, "prop_henderson_abuse_dp_world_pending") || firstCard(legalIngestBundle, "henderson_abuse");
  const sourceBackedRules = [
    abuseCard && {
      proposition_card_id: abuseCard.proposition_id,
      paragraph_card_id: abuseCard.paragraph_id,
      rule_text: "The inconsistent-positions principle may extend beyond factual allegations to inconsistent positions or assumptions in different proceedings.",
      citation: sourceLabel(abuseCard),
      verification_status: abuseCard.verification_status,
      answer_layer_status: abuseCard.answer_layer_status,
    },
    estoppelCard && {
      proposition_card_id: estoppelCard.proposition_id,
      paragraph_card_id: estoppelCard.paragraph_id,
      rule_text: "A party adopting an inconsistent and incompatible position may face abuse-of-process and estoppel objections.",
      citation: sourceLabel(estoppelCard),
      verification_status: estoppelCard.verification_status,
      answer_layer_status: estoppelCard.answer_layer_status,
    },
    diametricCard && {
      proposition_card_id: diametricCard.proposition_id,
      paragraph_card_id: diametricCard.paragraph_id,
      rule_text: "A diametrically opposed later position taken with knowledge of the facts is especially serious because of the integrity-of-justice concern.",
      citation: sourceLabel(diametricCard),
      verification_status: diametricCard.verification_status,
      answer_layer_status: diametricCard.answer_layer_status,
    },
    alternativeCard && {
      proposition_card_id: alternativeCard.proposition_id,
      paragraph_card_id: alternativeCard.paragraph_id,
      rule_text: "Alternative factual pleading is more vulnerable where the true facts are plainly within the party's own knowledge.",
      citation: sourceLabel(alternativeCard),
      verification_status: alternativeCard.verification_status,
      answer_layer_status: alternativeCard.answer_layer_status,
    },
    summaryJudgmentCard && {
      proposition_card_id: summaryJudgmentCard.proposition_id,
      paragraph_card_id: summaryJudgmentCard.paragraph_id,
      rule_text: "A material deviation between verification evidence and the pleaded case can undermine summary judgment.",
      citation: sourceLabel(summaryJudgmentCard),
      verification_status: summaryJudgmentCard.verification_status,
      answer_layer_status: summaryJudgmentCard.answer_layer_status,
    },
    hendersonCard && {
      proposition_card_id: hendersonCard.proposition_id,
      paragraph_card_id: hendersonCard.paragraph_id,
      rule_text: "Henderson-type abuse is flagged as relevant, but this card still requires full pinpoint verification before final use.",
      citation: sourceLabel(hendersonCard),
      verification_status: hendersonCard.verification_status,
      answer_layer_status: hendersonCard.answer_layer_status,
    },
  ].filter(Boolean);
  const formCandidates = legalIngestBundle?.form_metadata || [];
  const answerSections = [
    "Legal Issues",
    "Source-Backed Rules",
    "Application To Facts",
    "Procedural Consequences",
    "Documents / Forms",
    "Missing Facts",
    "Risks / Caveats",
  ];
  return {
    applied_answer: {
      title: "Professional Analysis - Inconsistent Positions Across Proceedings",
      mode: "professional_source_gated",
      short_answer: "Professional mode is not automatically more accurate, but it should be more verifiable and less dangerously oversimplified. For inconsistent factual pleadings across proceedings, the likely consequences are abuse-of-process arguments, possible estoppel/res judicata issues, collateral-attack objections, strike-out or stay applications, adverse credibility use, and costs consequences. Any final proposition still needs verified authority cards and paragraph pinpoints.",
      sections: [
        {
          heading: "Legal Issues",
          items: [
            "Whether the two positions are genuinely inconsistent, merely different emphasis, or properly pleaded in the alternative.",
            "Whether the inconsistency is factual, legal, evidential, or an assumption underlying the earlier proceeding.",
            "Whether the earlier position was significant, within the party's own knowledge, and advanced with full awareness of the facts.",
            "Whether there was a final determination, reliance, or issue/cause-of-action overlap giving rise to estoppel or res judicata.",
            "Whether the later position is an impermissible collateral attack on an earlier judgment, order, award or public-law decision.",
          ],
        },
        {
          heading: "Source-Backed Rules",
          items: sourceBackedRules.length ? sourceBackedRules.map(rule => `${rule.rule_text} [${rule.citation}]`) : [
            "No paragraph-backed proposition card has been loaded for this vertical yet; keep all rules at source-verification-required status.",
          ],
        },
        {
          heading: "Application To Facts",
          items: [
            "Compare the two pleadings or statements side by side and isolate the exact inconsistent propositions.",
            "Ask whether the propositions can both be true. If they are diametrically opposed on the same material fact, the abuse argument becomes stronger.",
            "Check whether the earlier statement was central to relief, jurisdiction, limitation, standing, quantum or another material issue.",
            "Check whether the party can explain the inconsistency: mistake, new evidence, different legal context, alternative pleading, lack of knowledge at the time, or amendment after clarification.",
            "If the inconsistency concerns facts personally known to the plaintiff, the credibility and abuse-of-process consequences are more serious.",
          ],
        },
        {
          heading: "Procedural Consequences",
          items: [
            "Strike-out or stay application for abuse of process where the inconsistency is clear, material and unexplained.",
            "Estoppel / res judicata objection if the earlier proceeding finally determined the relevant cause of action or issue.",
            "Collateral-attack objection if the later pleading seeks indirectly to undermine an earlier judgment/order/award; this point remains source-verification-required until a paragraph-backed collateral-attack card is added.",
            "Use in cross-examination and submissions on credibility, reliability and inherent probability.",
            "Resistance to summary judgment if the plaintiff's verifying affirmation materially departs from the pleaded case.",
            "Costs consequences, including adverse or indemnity costs in sufficiently serious cases.",
          ],
        },
        {
          heading: "Documents / Forms",
          items: formCandidates.length ? formCandidates.map(form => {
            const facts = (form.required_facts || []).slice(0, 4).join(", ");
            return `${formLabel(form)} — required facts: ${facts}.`;
          }) : [
            "Pleading inconsistency matrix comparing proceeding A and proceeding B by paragraph, date, maker and verification status.",
            "Affirmation or witness statement exhibiting the inconsistent pleadings, affidavits, orders and procedural history.",
            "Summons/application notice for strike-out, stay, abuse-of-process relief or case-management directions, depending on the procedural stage.",
            "Skeleton argument separating abuse of process, estoppel/res judicata and collateral attack instead of blending them into one label.",
            "Cross-examination note and costs submission if the issue is to be used at trial rather than disposed of summarily.",
          ],
        },
        {
          heading: "Missing Facts",
          items: [
            "Exact text of both inconsistent statements and where they appear.",
            "Whether the same plaintiff, privies, factual issue and relief are involved.",
            "Procedural status of each proceeding and whether any judgment/order/award has been made.",
            "Whether the first position was pleaded in the alternative or later amended/explained.",
            "Whether the relevant facts were within the plaintiff's own knowledge.",
            "What relief is sought now: strike-out, stay, estoppel ruling, cross-examination use, costs, or amendment.",
          ],
        },
        {
          heading: "Risks / Caveats",
          items: [
            "Not every inconsistency is an abuse of process. Courts generally look for material, clear and unfair inconsistency, not minor drafting differences.",
            "A party may be allowed to change position where there is a reasonable explanation, new evidence, or genuinely different procedural context.",
            "Professional mode should not invent authority. If paragraph-verified source cards are missing, the output should remain research-only and lawyer-review-required.",
            "Longer answers are not automatically more accurate; they are only better when citations, holdings and fact application are verifiable.",
          ],
        },
      ],
    },
    classification: {
      matter_type: "general_legal_research",
      practice_area: "civil_litigation",
      scenario: "inconsistent_positions_across_proceedings",
      user_perspective: "litigant_or_adviser",
      procedural_posture: "professional_research_triage",
      answer_mode: "professional_source_gated",
      query,
    },
    answer_contract: {
      domain: "general_legal_research",
      practice_area: "civil_litigation",
      scenario_family: "abuse_estoppel_collateral_attack",
      scenario_subtype: "inconsistent_positions_across_proceedings",
      answer_sections: answerSections,
      verification_rule: "No paragraph citation means research-only, source-verification-required output.",
      forbidden_output: ["unsupported final legal proposition", "raw retrieval score in main answer", "irrelevant retrieved narrative contamination"],
      source_card_policy: "Visible legal propositions in Source-Backed Rules must map to source_backed_rules[].proposition_card_id or be expressly marked source-verification-required.",
    },
    source_backed_rules: sourceBackedRules,
    form_candidates: formCandidates.map(form => ({
      form_id: form.form_id,
      title: form.title,
      document_type: form.document_type,
      trigger_conditions: form.trigger_conditions || [],
      required_facts: form.required_facts || [],
      review_status: form.review_status,
      output_mode: form.output_mode,
    })),
    unsupported_claims: [
      {
        claim: "Collateral attack may be relevant where the later case indirectly attacks an earlier judgment/order/award.",
        status: "source_verification_required",
        reason: "No paragraph-verified collateral-attack proposition card is included in this vertical yet.",
      },
      {
        claim: "Costs consequences may include adverse or indemnity costs.",
        status: "source_verification_required",
        reason: "A costs-specific source card should be added before treating this as a final proposition.",
      },
    ],
    source_audit: {
      display: "collapsed",
      source_registry: legalIngestBundle?.source_registry || [],
      paragraph_cards: legalIngestBundle?.legal_paragraphs || [],
      proposition_cards: legalIngestBundle?.proposition_cards || [],
      form_metadata: formCandidates,
      verification_status: legalIngestBundle ? "quote_verified_research_only_human_review_required" : "candidate_authorities_require_paragraph_check",
    },
  };
}

function professionalGenericLegalAnswer(query, matched) {
  const topMatches = matched.slice(0, 5).map(item => item.title).filter(Boolean);
  const nodeSummary = topMatches.length ? topMatches.join(", ") : "no strong domain-specific graph match";
  const answerSections = [
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
    "Documents / Forms",
  ];
  return {
    applied_answer: {
      title: "Unsupported General Query - Source Verification Required",
      mode: "professional_source_gated",
      short_answer: "This query is outside the currently source-gated demo verticals unless a separate verified vertical bundle is loaded. Treat this as unsupported general research orientation only: no final HK legal proposition should be used without verified authority cards, paragraph pinpoints, and lawyer review.",
      sections: [
        {
          heading: "Short Answer",
          items: [
            `Current graph orientation: ${nodeSummary}.`,
            "The system must not present this as a supported HK legal AI answer; unsupported propositions remain source verification required.",
          ],
        },
        {
          heading: "Issues",
          items: [
            "Identify the exact legal issue, procedural posture, jurisdiction and relief sought.",
            "Separate facts, legal tests, procedural consequences, forms/documents and evidential gaps.",
            "Check whether the retrieved graph nodes are genuinely relevant or merely lexical matches.",
          ],
        },
        {
          heading: "Governing Law / Elements",
          items: [
            "No governing legal rule is treated as established for this unsupported general query.",
            "A supported answer requires statute/source cards, paragraph cards where cases are used, issue mapping and current-treatment checks.",
          ],
        },
        {
          heading: "Relevant Authorities",
          items: [
            "No verified authority pack is attached for this general query.",
            "Do not cite cases, statutes or commentary as answer authority unless a public source card and paragraph/source proof are attached.",
          ],
        },
        {
          heading: "Case-by-Case Authorities",
          items: [
            "No case-by-case authority is attached for this unsupported query.",
          ],
        },
        {
          heading: "Extracted Legal Principles",
          items: [
            "No extracted legal principle is answer authority for this unsupported query.",
            "Any principle would need source-card and paragraph-card support before use.",
          ],
        },
        {
          heading: "Application to User Facts",
          items: [
            "Map each known fact to a legal issue or procedural requirement.",
            "State which facts are missing before giving a conclusion.",
            "Avoid converting a generic doctrine match into a definitive answer without source support.",
          ],
        },
        {
          heading: "Evidence Analysis",
          items: [
            "No uploaded evidence has been parsed in this response.",
            "Keep user facts, document evidence, legal authorities and AI inferences separate until an evidence ingestion layer maps them to issues.",
          ],
        },
        {
          heading: "Missing Facts",
          items: [
            "Exact procedural stage.",
            "Relevant documents already filed/served/received.",
            "Relief sought and urgency/deadlines.",
            "Facts needed to apply the retrieved rule or choose a form.",
          ],
        },
        {
          heading: "Practical Next Steps",
          items: [
            "Route the query to a supported vertical or create a source-grounded vertical pack before answering.",
            "Collect official statutes, public judgments, paragraph proof, issue tags and golden queries for the field.",
            "Use form/document suggestions only after legal route classification.",
          ],
        },
        {
          heading: "Source Audit",
          items: [
            "Professional mode is more useful only if citations and paragraph references are real and correctly used.",
            "Longer answers can still hallucinate, overstate or import irrelevant material unless composition is controlled.",
            "If source support is missing, the correct output is source verification required, not a confident final answer.",
          ],
        },
        {
          heading: "Documents / Forms",
          items: [
            "No document pack is recommended for this unsupported query.",
            "Forms are downstream of legal issue classification and verified procedural source support.",
          ],
        },
      ],
    },
    classification: {
      matter_type: "general_legal_research",
      scenario: "professional_generic_legal_analysis",
      user_perspective: "unspecified",
      procedural_posture: "professional_research_triage",
      answer_mode: "professional_source_gated",
      query,
    },
    answer_contract: {
      domain: "general_legal_research",
      scenario_family: "generic_professional_legal_analysis",
      scenario_subtype: "source_gated_professional_answer",
      answer_sections: answerSections,
      verification_rule: "No paragraph citation means research-only, source-verification-required output.",
      forbidden_output: ["unsupported final legal proposition", "raw retrieval score in main answer", "irrelevant retrieved narrative contamination"],
    },
    source_audit: {
      display: "collapsed",
      matched_count: matched.length,
      verification_status: "requires_verified_source_cards_for_final_answer",
    },
  };
}

function composeGenericAnswer({ query, matched = [], legalIngestBundle = null }) {
  if (detectsInconsistentPleadings(query)) return professionalInconsistentPleadingsAnswer(query, legalIngestBundle);
  return professionalGenericLegalAnswer(query, matched);
}

module.exports = {
  composeGenericAnswer,
  detectsInconsistentPleadings,
  professionalGenericLegalAnswer,
  professionalInconsistentPleadingsAnswer,
};
