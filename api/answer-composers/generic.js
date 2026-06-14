function composeGenericAnswer({ query, matched = [] }) {
  const topMatches = matched.slice(0, 3).map(item => item.title).filter(Boolean);
  return {
    applied_answer: {
      title: "Source-Gated Legal Triage",
      short_answer: "Use this as a research trail, not a final legal answer. The system should answer only from verified graph evidence and should ask for missing facts where source support is incomplete.",
      sections: [
        {
          heading: "Short Answer",
          items: topMatches.length
            ? [`Relevant graph areas found: ${topMatches.join(", ")}.`]
            : ["No strong applied-answer composer exists for this query yet."],
        },
        {
          heading: "Next Steps",
          items: [
            "Review the matched source cards and paragraph evidence.",
            "Separate legal authority from precedent or form metadata.",
            "Treat unsupported points as source verification required.",
          ],
        },
      ],
    },
    classification: {
      matter_type: "generic_legal_inquiry",
      scenario: "unclassified",
      user_perspective: "unspecified",
      procedural_posture: "research_triage",
      query,
    },
    source_audit: {
      display: "collapsed",
      matched_count: matched.length,
    },
  };
}

module.exports = {
  composeGenericAnswer,
};
