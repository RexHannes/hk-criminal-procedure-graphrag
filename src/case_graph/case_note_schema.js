/**
 * Structured case-note schema for paragraph-linked public judgments.
 *
 * A case note is the product-facing legal research unit: one note per case,
 * aggregating all verified paragraph proofs for that case plus structured
 * legal analysis fields. Fields that cannot be extracted from verified
 * paragraph text are set to the UNKNOWN sentinel with a reason, never invented.
 */

const UNKNOWN = "unknown_or_unextracted";

const REQUIRED_STRING_FIELDS = [
  "case_id",
  "case_name",
  "citation",
  "public_source_url",
  "legal_issue",
  "holding",
  "ratio_or_core_principle",
  "application_summary",
];

const REQUIRED_ARRAY_FIELDS = [
  "paragraph_refs",
  "exact_quotes",
  "sub_issue_tags",
];

const NOTE_FIELDS = [
  "note_id",
  "case_id",
  "case_name",
  "citation",
  "neutral_citation",
  "law_report_citation",
  "court",
  "court_level",
  "judgment_date",
  "public_source_url",
  "paragraph_refs",          // [{paragraph_id, paragraph_number, exact_quote, paragraph_text, source_url, paragraph_role}]
  "exact_quotes",
  "material_facts",          // string or UNKNOWN
  "material_facts_support",  // paragraph ids supporting material_facts
  "procedural_posture",
  "procedural_posture_support",
  "legal_issue",
  "legal_issue_support",
  "sub_issue_tags",
  "holding",
  "holding_support",
  "ratio_or_core_principle",
  "ratio_support",
  "obiter_or_limits",
  "obiter_support",
  "statutory_context",
  "application_summary",
  "application_support",
  "fact_patterns_supported",
  "fact_patterns_not_supported",
  "distinguishing_points",
  "related_authorities",
  "later_treatment_placeholder",
  "current_treatment_status",
  "confidence_notes",
  "unknown_field_reasons",   // {field: reason} for every UNKNOWN field
  "authority_role",
  "case_level",
  "doctrine_node_ids",
  "source_status",
  "research_use_allowed",
  "lawyer_review_status",
  "answer_mode",
  "professional_advice_certified",
];

function emptyCaseNote() {
  return {
    note_id: "",
    case_id: "",
    case_name: "",
    citation: "",
    neutral_citation: "",
    law_report_citation: "",
    court: UNKNOWN,
    court_level: UNKNOWN,
    judgment_date: UNKNOWN,
    public_source_url: "",
    paragraph_refs: [],
    exact_quotes: [],
    material_facts: UNKNOWN,
    material_facts_support: [],
    procedural_posture: UNKNOWN,
    procedural_posture_support: [],
    legal_issue: "",
    legal_issue_support: [],
    sub_issue_tags: [],
    holding: "",
    holding_support: [],
    ratio_or_core_principle: "",
    ratio_support: [],
    obiter_or_limits: UNKNOWN,
    obiter_support: [],
    statutory_context: UNKNOWN,
    application_summary: "",
    application_support: [],
    fact_patterns_supported: [],
    fact_patterns_not_supported: [],
    distinguishing_points: [],
    related_authorities: [],
    later_treatment_placeholder: "later_treatment_not_yet_checked",
    current_treatment_status: "unchecked",
    confidence_notes: "",
    unknown_field_reasons: {},
    authority_role: UNKNOWN,
    case_level: UNKNOWN,
    doctrine_node_ids: [],
    source_status: "paragraph_linked_public_source",
    research_use_allowed: true,
    lawyer_review_status: "unreviewed",
    answer_mode: "research_prototype",
    professional_advice_certified: false,
  };
}

function validateCaseNote(note = {}) {
  const errors = [];
  for (const field of NOTE_FIELDS) {
    if (!(field in note)) errors.push(`missing_field:${field}`);
  }
  for (const field of REQUIRED_STRING_FIELDS) {
    const value = note[field];
    if (!value || typeof value !== "string") errors.push(`empty_required_field:${field}`);
  }
  for (const field of REQUIRED_ARRAY_FIELDS) {
    if (!Array.isArray(note[field]) || note[field].length === 0) errors.push(`empty_required_array:${field}`);
  }
  if (note.source_status !== "paragraph_linked_public_source") errors.push("wrong_source_status");
  if (note.research_use_allowed !== true) errors.push("research_use_not_allowed");
  if (note.professional_advice_certified !== false) errors.push("professional_advice_flag_wrong");
  if (note.current_treatment_status !== "unchecked") errors.push("treatment_status_must_be_unchecked");

  for (const ref of note.paragraph_refs || []) {
    if (!ref.paragraph_number) errors.push(`paragraph_ref_missing_number:${ref.paragraph_id || "?"}`);
    if (!ref.exact_quote) errors.push(`paragraph_ref_missing_quote:${ref.paragraph_id || "?"}`);
    if (!ref.paragraph_text || !String(ref.paragraph_text).includes(String(ref.exact_quote))) {
      errors.push(`quote_not_in_paragraph:${ref.paragraph_id || "?"}`);
    }
    if (!ref.source_url) errors.push(`paragraph_ref_missing_source:${ref.paragraph_id || "?"}`);
  }

  // Every analytic statement that is filled (not UNKNOWN) must carry paragraph support.
  const supportPairs = [
    ["material_facts", "material_facts_support"],
    ["procedural_posture", "procedural_posture_support"],
    ["holding", "holding_support"],
    ["ratio_or_core_principle", "ratio_support"],
    ["application_summary", "application_support"],
  ];
  const validIds = new Set((note.paragraph_refs || []).map(r => r.paragraph_id));
  for (const [field, supportField] of supportPairs) {
    const value = note[field];
    if (value && value !== UNKNOWN) {
      const support = note[supportField] || [];
      if (!support.length) errors.push(`statement_without_support:${field}`);
      for (const id of support) {
        if (!validIds.has(id)) errors.push(`support_id_not_in_paragraph_refs:${field}:${id}`);
      }
    }
  }

  // Every UNKNOWN field must record a reason.
  for (const field of ["material_facts", "procedural_posture", "obiter_or_limits", "statutory_context"]) {
    if (note[field] === UNKNOWN && !(note.unknown_field_reasons || {})[field]) {
      errors.push(`unknown_without_reason:${field}`);
    }
  }

  return { ok: errors.length === 0, errors };
}

module.exports = {
  UNKNOWN,
  NOTE_FIELDS,
  emptyCaseNote,
  validateCaseNote,
};
