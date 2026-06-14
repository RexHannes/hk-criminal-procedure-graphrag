function composeCriminalProcedureAnswer({ query }) {
  return {
    applied_answer: {
      title: "Criminal Procedure Triage",
      short_answer: "A dedicated criminal-procedure composer is scaffolded but not yet domain-complete. Until source cards are wired into this composer, show graph evidence and mark applied guidance as source verification required.",
      sections: [
        {
          heading: "Current Gate",
          items: [
            "Do not produce free-form criminal procedure advice from model memory.",
            "Use verified procedure nodes, forms, deadlines and review gates before rendering a lawyer-facing answer.",
          ],
        },
      ],
    },
    classification: {
      matter_type: "criminal_procedure",
      scenario: "composer_scaffold",
      user_perspective: "unspecified",
      procedural_posture: "source_verification_required",
      query,
    },
    source_audit: {
      display: "collapsed",
      note: "Composer scaffold only; use the underlying graph trail for now.",
    },
  };
}

module.exports = {
  composeCriminalProcedureAnswer,
};
