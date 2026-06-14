function classifyCompanyForms(query) {
  const q = String(query || "").toLowerCase();
  let scenario = "company_or_civil_forms_general";
  if (/\b(winding[- ]?up|statutory demand|petition|insolvency)\b/.test(q)) scenario = "winding_up_or_statutory_demand";
  else if (/\b(incorporation|incorporate|new company|company registration)\b/.test(q)) scenario = "company_incorporation";
  else if (/\b(listing|listed|sehk|sfc|announcement|inside information)\b/.test(q)) scenario = "listed_company_compliance";
  else if (/\b(statement of claim|defence|writ|pleading)\b/.test(q)) scenario = "civil_pleading_or_form";
  return {
    matter_type: "company_or_civil_forms",
    scenario,
    user_perspective: /\b(i|we|our company|client)\b/.test(q) ? "requesting_party_or_adviser" : "unspecified",
    procedural_posture: scenario === "company_or_civil_forms_general" ? "form_registry_required" : "forms_and_source_triage",
    query,
  };
}

function appliedCompanyFormsAnswer(classification) {
  if (classification.scenario === "winding_up_or_statutory_demand") {
    return {
      title: "Applied Triage - Winding-Up / Demand Route",
      short_answer: "Do not draft or file from memory. First identify the debt, debtor, demand/petition posture, service facts, dispute risk and the exact registered form/template before any document output.",
      sections: [
        {
          heading: "Applied Analysis",
          items: [
            "Separate the commercial facts from the procedural filing route.",
            "Check whether the debt is admitted, disputed, secured, paid, set off or subject to cross-claim allegations.",
            "Confirm service, deadline, court/forum and supporting affidavit evidence before recommending a filing step.",
          ],
        },
        {
          heading: "Documents / Forms",
          items: [
            "Demand / petition / affidavit candidates only if the registry contains the form/template.",
            "Missing template or current-source check means no final draft.",
            "Show source/version, required fields, missing facts and lawyer review status.",
          ],
        },
      ],
    };
  }
  return {
    title: "Company / Civil Forms Triage",
    short_answer: "This is a source-gated form triage. The system should recommend forms only when a registered form/template, source/version, required fields and review status are available.",
    sections: [
      {
        heading: "Current Gate",
        items: [
          "No template means no final draft.",
          "Form recommendations must identify source, version/date, required fields, missing facts and review status.",
        ],
      },
      {
        heading: "Missing Facts",
        items: [
          "Exact transaction/procedure type.",
          "Court, registry, company status or filing context.",
          "Document already served/received and deadline.",
        ],
      },
    ],
  };
}

function composeCompanyFormsAnswer({ query }) {
  const classification = classifyCompanyForms(query);
  return {
    applied_answer: appliedCompanyFormsAnswer(classification),
    classification,
    source_audit: {
      display: "collapsed",
      note: "Use registered form metadata and source trail before drafting.",
    },
  };
}

module.exports = {
  classifyCompanyForms,
  composeCompanyFormsAnswer,
};
