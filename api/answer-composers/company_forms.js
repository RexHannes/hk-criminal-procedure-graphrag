function composeCompanyFormsAnswer({ query }) {
  return {
    applied_answer: {
      title: "Company / Civil Forms Triage",
      short_answer: "A dedicated company/forms composer is scaffolded but not yet domain-complete. The system should recommend forms only when a registered form/template and required fields are available.",
      sections: [
        {
          heading: "Current Gate",
          items: [
            "No template means no final draft.",
            "Form recommendations must identify source, version/date, required fields, missing facts and review status.",
          ],
        },
      ],
    },
    classification: {
      matter_type: "company_or_civil_forms",
      scenario: "composer_scaffold",
      user_perspective: "unspecified",
      procedural_posture: "form_registry_required",
      query,
    },
    source_audit: {
      display: "collapsed",
      note: "Composer scaffold only; use registered form metadata and source trail before drafting.",
    },
  };
}

module.exports = {
  composeCompanyFormsAnswer,
};
