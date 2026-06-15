function detectsInconsistentPleadings(query) {
  const q = String(query || "").toLowerCase();
  return (
    /\b(inconsistent|contradictory|diametrically opposed|opposite|different version|different versions)\b/.test(q) &&
    /\b(pleading|pleadings|statement|statements|affidavit|affirmation|proceeding|proceedings|case|cases|action|actions)\b/.test(q)
  ) || /\b(abuse of process|estoppel|collateral attack|res judicata|henderson)\b/.test(q);
}

function professionalInconsistentPleadingsAnswer(query) {
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
          items: [
            "Abuse of process: a court may object where a party advances a current position that is fundamentally inconsistent with a significant position or assumption adopted in another proceeding, especially where the facts were within that party's knowledge. Candidate authority cards should be verified before use.",
            "Estoppel / res judicata: if the earlier proceeding finally determined the same cause of action or issue between the same parties or privies, the later inconsistent position may be barred rather than merely criticised.",
            "Henderson-type abuse: even without strict estoppel, a party may be prevented from raising matters that could and should have been raised earlier, depending on overlap, timing, explanation and fairness.",
            "Collateral attack: a later proceeding should not be used indirectly to impeach a prior judgment/order/award where the proper route was appeal, review, setting aside or other direct challenge.",
            "Alternative pleading caveat: inconsistent allegations in the same pleading may be permissible where there are reasonable grounds and they are pleaded in the alternative; this is different from taking irreconcilable factual positions across separate proceedings.",
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
            "Collateral-attack objection if the later pleading seeks indirectly to undermine an earlier judgment/order/award.",
            "Use in cross-examination and submissions on credibility, reliability and inherent probability.",
            "Resistance to summary judgment if the plaintiff's verifying affirmation materially departs from the pleaded case.",
            "Costs consequences, including adverse or indemnity costs in sufficiently serious cases.",
          ],
        },
        {
          heading: "Documents / Forms",
          items: [
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
    },
    source_audit: {
      display: "collapsed",
      candidate_authority_cards: [
        "Re Minloy Ltd and others - inconsistent positions / assumptions across proceedings",
        "Lancom Ltd v Capxon International Electronic Co Ltd - abuse/estoppel framing",
        "Chan Chun Chuen v Kao, Lee & Yip - diametrically opposed positions / integrity of justice",
        "Liu Hao Tsing Education Foundation Ltd v Liu Tieh Ching Brandon - inconsistent alternatives within knowledge",
        "Shinyei (Shanghai) Trading Co Ltd v Jenus Top Ltd - material deviation from pleaded case and summary judgment",
      ],
      verification_status: "candidate_authorities_require_paragraph_check",
    },
  };
}

function professionalGenericLegalAnswer(query, matched) {
  const topMatches = matched.slice(0, 5).map(item => item.title).filter(Boolean);
  const nodeSummary = topMatches.length ? topMatches.join(", ") : "no strong domain-specific graph match";
  const answerSections = [
    "Short Answer",
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
      title: "Professional Source-Gated Legal Analysis",
      mode: "professional_source_gated",
      short_answer: "This is a professional-mode research answer: fuller and more auditable, but not automatically more accurate. Treat it as source-gated legal analysis. Any legal proposition needs verified authority cards, paragraph pinpoints, and lawyer review before use.",
      sections: [
        {
          heading: "Short Answer",
          items: [
            `Current graph orientation: ${nodeSummary}.`,
            "The system should give an applied answer, but must mark unsupported propositions as source verification required.",
          ],
        },
        {
          heading: "Legal Issues",
          items: [
            "Identify the exact legal issue, procedural posture, jurisdiction and relief sought.",
            "Separate facts, legal tests, procedural consequences, forms/documents and evidential gaps.",
            "Check whether the retrieved graph nodes are genuinely relevant or merely lexical matches.",
          ],
        },
        {
          heading: "Source-Backed Rules",
          items: [
            "Use only retrieved, verified source cards for final legal propositions.",
            "If a rule has no paragraph pinpoint or current source check, keep it at research-only status.",
            "Distinguish court holdings from party submissions, commentary, precedent wording and form metadata.",
          ],
        },
        {
          heading: "Application To Facts",
          items: [
            "Map each known fact to a legal issue or procedural requirement.",
            "State which facts are missing before giving a conclusion.",
            "Avoid converting a generic doctrine match into a definitive answer without source support.",
          ],
        },
        {
          heading: "Procedural Consequences",
          items: [
            "Identify possible applications, deadlines, review gates, evidence steps and costs consequences.",
            "Keep court/form recommendations as candidates until a form registry item or verified procedural source supports them.",
          ],
        },
        {
          heading: "Documents / Forms",
          items: [
            "List likely documents or forms only as candidates unless an exact form/template is registered.",
            "For drafting, require a template/source, required fields, missing facts and lawyer-review status.",
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
          heading: "Risks / Caveats",
          items: [
            "Professional mode is more useful only if citations and paragraph references are real and correctly used.",
            "Longer answers can still hallucinate, overstate or import irrelevant material unless composition is controlled.",
            "If source support is missing, the correct output is source verification required, not a confident final answer.",
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

function composeGenericAnswer({ query, matched = [] }) {
  if (detectsInconsistentPleadings(query)) return professionalInconsistentPleadingsAnswer(query);
  return professionalGenericLegalAnswer(query, matched);
}

module.exports = {
  composeGenericAnswer,
  detectsInconsistentPleadings,
  professionalGenericLegalAnswer,
  professionalInconsistentPleadingsAnswer,
};
