const LIABILITY_ISSUE_PATTERN = /criminal_law\.(dishonesty|fraud|deception)|criminal_law\.theft\.(dishonesty|mens_rea|appropriation|belonging_to_another|intention_permanently_deprive|mistake_or_forgot_to_pay)/;
const SENTENCING_PATTERN = /\b(sentence|sentencing|imprisonment|custodial|mitigation|starting point|aggravat|discount|plea|tariff)\b/i;
const PROCEDURE_PATTERN = /\b(caution|interview|vri|video-recorded|bail|remand|surrender to custody|pending appeal|procedural)\b/i;
const BACKGROUND_PATTERN = /\b(public case context only|background-only|background|not answer-safe|procedural history)\b/i;
const LEGAL_TEST_PATTERN = /\b(test|element|requires?|prove|prosecution must|legal test|ingredients?|mens rea|dishonest|appropriat|permanent(?:ly)? depriv|belong(?:ing)? to another)\b/i;
const GENERIC_QUOTE_PATTERN = /^(?:theft ordinance|cap\.?\s*210|section\s+\d+|offence of theft|handling stolen goods|burglary|the charge)\b[\s,.;()"\u201c\u201d-]*$/i;

function tokenCount(text = "") {
  return String(text || "").trim().split(/\s+/).filter(Boolean).length;
}

function linkedRecords(ids = [], byId = new Map()) {
  return ids.map(id => byId.get(id)).filter(Boolean);
}

function hasSpecificLiabilityIssue(issueTags = []) {
  return issueTags.some(tag => LIABILITY_ISSUE_PATTERN.test(tag));
}

function quoteTooShort(quote = "") {
  const value = String(quote || "").trim();
  return value.length < 24 || tokenCount(value) < 4;
}

function quoteContextInsufficient(quote = "", paragraphText = "") {
  const value = String(quote || "").trim();
  if (!value) return true;
  if (GENERIC_QUOTE_PATTERN.test(value)) return true;
  if (value.length < 42 && /^(?:theft ordinance|cap\.?\s*210|section\s+\d+|offence|charge)\b/i.test(value)) return true;
  const paragraph = String(paragraphText || "");
  if (!paragraph.includes(value)) return true;
  const contextWindow = paragraph.slice(Math.max(0, paragraph.indexOf(value) - 60), paragraph.indexOf(value) + value.length + 60);
  return contextWindow.length < value.length + 30;
}

function classifyLiabilityRelevance({ principle = {}, paragraphs = [], propositions = [] } = {}) {
  const issueTags = principle.issue_tags || [];
  const blob = [
    principle.principle_text,
    principle.exact_quote_support,
    principle.liability_relevance,
    ...issueTags,
    ...paragraphs.map(paragraph => `${paragraph.authority_role_candidate || ""} ${paragraph.legal_function || ""} ${paragraph.paragraph_text || ""}`),
    ...propositions.map(prop => `${prop.authority_role_candidate || ""} ${prop.legal_function || ""} ${prop.proposition_text || ""}`),
  ].join(" ");

  if (SENTENCING_PATTERN.test(blob) && !hasSpecificLiabilityIssue(issueTags)) return "sentencing";
  if (PROCEDURE_PATTERN.test(blob) && !hasSpecificLiabilityIssue(issueTags)) return "procedure";
  if (BACKGROUND_PATTERN.test(blob) && !hasSpecificLiabilityIssue(issueTags)) return "background";
  if (SENTENCING_PATTERN.test(blob) && hasSpecificLiabilityIssue(issueTags)) return "sentencing";
  if (PROCEDURE_PATTERN.test(blob) && hasSpecificLiabilityIssue(issueTags)) return "procedure";
  if (hasSpecificLiabilityIssue(issueTags)) return "liability";
  return "background";
}

function assessPrincipleQuality(principle = {}, { paragraphById = new Map(), propositionById = new Map() } = {}) {
  const paragraphs = linkedRecords(principle.source_paragraph_ids || [], paragraphById);
  const propositions = linkedRecords(principle.source_proposition_ids || [], propositionById);
  const paragraphText = paragraphs.map(paragraph => paragraph.paragraph_text || "").join(" ");
  const roleBlob = [
    ...paragraphs.map(paragraph => `${paragraph.authority_role_candidate || ""} ${paragraph.legal_function || ""}`),
    ...propositions.map(prop => `${prop.authority_role_candidate || ""} ${prop.legal_function || ""}`),
  ].join(" ");
  const textBlob = [principle.principle_text, paragraphText].join(" ");
  const issueTags = principle.issue_tags || [];
  const quote = String(principle.exact_quote_support || "").trim();
  const liabilityRelevance = classifyLiabilityRelevance({ principle, paragraphs, propositions });
  const reasons = [];

  if (!paragraphs.length) reasons.push("missing_source_paragraph_link");
  if (!propositions.length) reasons.push("missing_source_proposition_link");
  if (quoteTooShort(quote)) reasons.push("quote_too_short");
  if (quoteContextInsufficient(quote, paragraphText)) reasons.push("quote_context_insufficient");
  if (/background|background_only/i.test(`${roleBlob} ${principle.principle_text || ""}`) && liabilityRelevance === "background") {
    reasons.push("background_only_not_principle");
  }
  if (liabilityRelevance === "sentencing" && hasSpecificLiabilityIssue(issueTags)) reasons.push("sentencing_only_not_liability");
  if (liabilityRelevance === "procedure" && hasSpecificLiabilityIssue(issueTags)) reasons.push("procedural_only_not_liability");
  if (/(procedural_history|background)/i.test(roleBlob) && LEGAL_TEST_PATTERN.test(principle.principle_text || "")) {
    reasons.push("authority_role_context_conflict");
  }
  if (!principle.limits || !principle.distinguishable_when) reasons.push("missing_limits_or_distinguishability");
  if (/public case context only|not answer-safe/i.test(principle.principle_text || "")) reasons.push("background_only_not_principle");
  if (/sentencing context/i.test(principle.principle_text || "") && hasSpecificLiabilityIssue(issueTags)) reasons.push("sentencing_only_not_liability");

  const uniqueReasons = Array.from(new Set(reasons));
  const principleQualityStatus = uniqueReasons.length ? "demoted" : "pass";
  return {
    principle_quality_status: principleQualityStatus,
    demotion_reasons: uniqueReasons,
    demotion_reason: uniqueReasons[0] || "",
    liability_relevance: liabilityRelevance,
    usable_in_answer_layer: principleQualityStatus === "pass",
  };
}

function principleUsable(principle = {}) {
  return principle.usable_in_answer_layer !== false && principle.principle_quality_status !== "demoted";
}

module.exports = {
  LIABILITY_ISSUE_PATTERN,
  SENTENCING_PATTERN,
  PROCEDURE_PATTERN,
  BACKGROUND_PATTERN,
  LEGAL_TEST_PATTERN,
  quoteTooShort,
  quoteContextInsufficient,
  hasSpecificLiabilityIssue,
  classifyLiabilityRelevance,
  assessPrincipleQuality,
  principleUsable,
};
