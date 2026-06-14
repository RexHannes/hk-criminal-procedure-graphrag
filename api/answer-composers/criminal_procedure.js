function classifyCriminalProcedure(query) {
  const q = String(query || "").toLowerCase();
  let scenario = "criminal_procedure_general";
  if (/\b(bail|remand|custody|release)\b/.test(q)) scenario = "bail_or_release";
  else if (/\b(arrest|detained|police station|interview)\b/.test(q)) scenario = "arrest_or_station_advice";
  else if (/\b(search warrant|seizure|search|seized)\b/.test(q)) scenario = "search_warrant_or_seizure";
  else if (/\b(plea|mention|charge|first hearing)\b/.test(q)) scenario = "charge_plea_or_mention";
  else if (/\b(appeal|review|sentence)\b/.test(q)) scenario = "appeal_review_or_sentence";
  return {
    matter_type: "criminal_procedure",
    scenario,
    user_perspective: /\b(i|my client|defendant|accused|arrested)\b/.test(q) ? "suspect_accused_or_defence" : "unspecified",
    procedural_posture: scenario === "criminal_procedure_general" ? "source_verification_required" : "urgent_triage",
    query,
  };
}

function appliedCriminalAnswer(classification) {
  if (classification.scenario === "bail_or_release") {
    return {
      title: "Applied Triage - Bail / Release",
      short_answer: "Treat bail questions as urgent and fact-sensitive. The system should identify the stage, court/police posture, alleged offence, bail history and risk factors, then show source cards and require lawyer review before any application strategy.",
      sections: [
        {
          heading: "Immediate Questions",
          items: [
            "Is the person at a police station, before a magistrate, remanded, or appealing/reapplying?",
            "What is the charge/alleged offence, next hearing date and any existing bail condition?",
            "Are there alleged risks of absconding, reoffending, witness interference or evidence interference?",
          ],
        },
        {
          heading: "Practical Next Steps",
          items: [
            "Collect charge sheet, recognizance/bail papers, custody/remand order and hearing date.",
            "Prepare residence, employment, surety, travel document and reporting-condition information.",
            "Show retrieved procedure/source cards before suggesting any bail route.",
          ],
        },
        {
          heading: "Review Gate",
          items: [
            "Do not present this as final advice without verified source cards and lawyer review.",
            "If liberty is at stake or a deadline is imminent, escalate immediately.",
          ],
        },
      ],
    };
  }
  return {
    title: "Criminal Procedure Triage",
    short_answer: "This is a source-gated criminal-procedure triage. It should identify the procedural stage, documents needed and urgent review gates, then rely on verified graph/source evidence before giving a legal position.",
    sections: [
      {
        heading: "Current Gate",
        items: [
          "Do not produce free-form criminal procedure advice from model memory.",
          "Use verified procedure nodes, forms, deadlines and review gates before rendering a lawyer-facing answer.",
        ],
      },
      {
        heading: "Missing Facts",
        items: [
          "Procedural stage and next hearing date.",
          "Charge/allegation and court or police station status.",
          "Documents already served or signed.",
        ],
      },
    ],
  };
}

function composeCriminalProcedureAnswer({ query }) {
  const classification = classifyCriminalProcedure(query);
  return {
    applied_answer: appliedCriminalAnswer(classification),
    classification,
    source_audit: {
      display: "collapsed",
      note: "Use the underlying graph/source trail before treating any criminal procedure point as supported.",
    },
  };
}

module.exports = {
  classifyCriminalProcedure,
  composeCriminalProcedureAnswer,
};
