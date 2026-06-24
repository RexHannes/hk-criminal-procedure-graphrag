const CRIMINAL_PUBLIC_ORDER_RE = /\b(unlawful assembly|riot|rioting|public order|protest|protestor|protester|harcourt road|black bloc|black clothing|conceal(?:ed|ment)?|masked|2019)\b/i;
const CRIMINAL_OFFENCE_RE = /\b(sedition|seditious|theft|assault|battery|manslaughter|murder|dishonesty|conspiracy|attempt|incitement|joint enterprise|accessory|aiding|abetting|criminal liability|offence|guilty|convicted|prosecuted|prosecution)\b/i;
const CRIMINAL_PROCEDURE_RE = /\b(arrest|arrested|detained|custody|remand|bail|release|search warrant|seizure|seized|police interview|charge sheet|charged|plea|mention|first hearing|appeal|sentence|review)\b/i;
const SEDITION_RE = /\b(sedition|seditious|critic(?:ise|ize|ises|izes|ising|izing|ism)?|government|public expression|speech|chant|slogan|incitement)\b/i;
const PI_PURPOSE_RE = /\b(personal injury|injur(?:y|ed|ies)|medical|compensation|damages|quantum|fracture|pain|suffering|loss of earnings|hospital|sick leave|accident claim)\b/i;
const PI_HIGH_SIGNAL_RE = /\b(personal injury|injur(?:y|ed|ies)|medical report|compensation|damages|loss of earnings|wet floor|slip|slipped|trip|tripped|road traffic|hit by car|knocked down|pedestrian|workplace injury)\b/i;
const PROBATE_RE = /\b(probate|executor|executrix|letters of administration|grant of representation|estate administration|intestate|codicil|caveat|reseal|renunciation|testator|testatrix|personal representative)\b/i;
const PROBATE_WILL_CONTEXT_RE = /\b(?:last|valid|original|copy|lost|nuncupative|privileged|testamentary)\s+will\b|\bwill\s+(?:annexed|validity|execution|codicil|probate|rectification)\b|\b(?:death|deceased|died|estate|grant|executor|executrix|testator|testatrix)\b.{0,60}\bwill\b|\bwill\b.{0,60}\b(?:executor|executrix|probate|grant|estate|codicil|testator|testatrix|beneficiary)\b/i;
const COMPANY_RE = /\b(company|listing|listed|sehk|sfc|winding[- ]?up|statutory demand|petition|insolvency|incorporation|director|shareholder|board|liquidator)\b/i;
const COMPANY_FORM_CONTEXT_RE = /\b(?:company|companies registry|sfc|sehk|listing|listed|director|shareholder|winding[- ]?up|liquidator)\b.{0,60}\b(?:form|filing|return|petition)\b|\b(?:form|filing|return|petition)\b.{0,60}\b(?:company|companies registry|sfc|sehk|listing|listed|director|shareholder|winding[- ]?up|liquidator)\b/i;
const CIVIL_LIT_RE = /\b(abuse of process|estoppel|collateral attack|res judicata|henderson|inconsistent pleadings|contradictory pleading)\b/i;
const DATA_PRIVACY_RE = /\b(personal data|data privacy|privacy commissioner|pcpd|pdpo|data protection principle|dpp1|dpp ?1|data access request|direct marketing|doxxing|medical records|employee data|data user|data subject)\b/i;

function hasSupplyToProtest(query) {
  return /\b(hand(?:ed|ing)?|give|gave|provid(?:e|ed|ing))\b/i.test(query) &&
    /\b(water|supplies|helmet|mask|umbrella)\b/i.test(query) &&
    /\b(protest|protestor|protester|riot|unlawful assembly)\b/i.test(query);
}

function hasProbateSignal(query) {
  return PROBATE_RE.test(query) || PROBATE_WILL_CONTEXT_RE.test(query);
}

function hasCompanySignal(query) {
  return COMPANY_RE.test(query) || COMPANY_FORM_CONTEXT_RE.test(query);
}

function criminalScenario(query) {
  if (CRIMINAL_PUBLIC_ORDER_RE.test(query) || hasSupplyToProtest(query)) return "public_order_unlawful_assembly_riot";
  if (/\b(sedition|seditious|critic(?:ise|ize|ises|izes|ising|izing|ism)?|government|public expression|speech|chant|slogan|incitement)\b/i.test(query)) return "sedition_public_expression";
  return "criminal_law_general";
}

function taskForQuery(query) {
  if (/\b(what should i do|urgent|now|arrested|caught|charged|bail|deadline|immediately)\b/i.test(query)) return "urgent_triage";
  if (/\b(form|document|template|draft|filing|application|summons)\b/i.test(query)) return "forms_documents";
  if (/\b(procedure|steps|sop|process|consecutively|step by step)\b/i.test(query)) return "procedure_sop";
  if (/\b(compensation|damages|quantum|remedy|costs)\b/i.test(query)) return "quantum_remedies";
  if (/\b(defence|defense|argue|mitigation|not guilty)\b/i.test(query)) return "defence";
  if (/\b(appeal|review|set aside)\b/i.test(query)) return "appeal_review";
  return "elements_or_test";
}

function postureForQuery(query) {
  if (/\b(i|me|my|my client|accused|defendant|suspect|caught|arrested|charged|prosecuted)\b/i.test(query)) return "defendant_accused_suspect";
  if (/\b(claimant|plaintiff|injured|victim|customer|employee)\b/i.test(query)) return "claimant_plaintiff";
  if (/\b(company|restaurant owner|operator|employer|business)\b/i.test(query)) return "business_operator";
  if (/\b(executor|administrator|trustee|personal representative)\b/i.test(query)) return "personal_representative_trustee";
  return "court_stage_unknown";
}

function arbitrateLegalQuery(query) {
  const q = String(query || "");
  const lower = q.toLowerCase();
  const task = taskForQuery(q);
  const posture = postureForQuery(q);
  const trace = [];
  const scores = {
    criminal_law: 0,
    criminal_procedure: 0,
    personal_injury: 0,
    probate: 0,
    company_forms: 0,
    data_privacy: 0,
    general_legal_research: 0,
  };

  if (CIVIL_LIT_RE.test(q)) {
    scores.general_legal_research += 12;
    trace.push("civil-litigation high-signal phrase");
  }
  if (CRIMINAL_PUBLIC_ORDER_RE.test(q) || hasSupplyToProtest(q)) {
    scores.criminal_law += 20;
    trace.push("criminal public-order strict signal");
  }
  if (CRIMINAL_OFFENCE_RE.test(q) || SEDITION_RE.test(q)) {
    scores.criminal_law += 14;
    trace.push("criminal-law/offence high-signal phrase");
  }
  if (CRIMINAL_PROCEDURE_RE.test(q)) {
    scores.criminal_procedure += 16;
    trace.push("criminal-procedure high-signal phrase");
  }
  if (PI_HIGH_SIGNAL_RE.test(q)) {
    scores.personal_injury += 10;
    trace.push("PI/tort high-signal phrase");
  }
  if (hasProbateSignal(q)) {
    scores.probate += 12;
    trace.push("probate high-signal phrase");
  }
  if (hasCompanySignal(q)) {
    scores.company_forms += 10;
    trace.push("company/forms high-signal phrase");
  }
  if (DATA_PRIVACY_RE.test(q)) {
    scores.data_privacy += 14;
    trace.push("data-privacy high-signal phrase");
  }

  const asksPiPurpose = PI_PURPOSE_RE.test(q);
  if ((CRIMINAL_PUBLIC_ORDER_RE.test(q) || SEDITION_RE.test(q) || CRIMINAL_OFFENCE_RE.test(q) || CRIMINAL_PROCEDURE_RE.test(q)) && !asksPiPurpose) {
    scores.personal_injury -= 20;
    scores.probate -= 12;
    trace.push("strict override: criminal-law signal without injury/compensation suppresses PI/probate");
  }
  if (asksPiPurpose && scores.criminal_law > 0) {
    trace.push("mixed criminal/civil query: keep criminal signal but allow PI only if injury/compensation explicit");
  }

  let selectedDomain = "generic";
  let maxScore = 0;
  for (const [domain, score] of Object.entries(scores)) {
    if (score > maxScore) {
      selectedDomain = domain;
      maxScore = score;
    }
  }

  const scenario = selectedDomain === "criminal_law" ? criminalScenario(q) : selectedDomain;
  const allowedStaticDomainsBySelected = {
    criminal_law: ["criminal_law_hk", "criminal_procedure_hk"],
    criminal_procedure: ["criminal_procedure_hk", "criminal_law_hk"],
    personal_injury: ["tort_law_hk"],
    probate: ["probate_law_hk"],
    company_forms: ["hk_listing_and_listed_company_regulation"],
    data_privacy: ["data_privacy_hk"],
    general_legal_research: [],
    generic: [],
  };
  const blockedDomains = [];
  if (selectedDomain === "criminal_law" || selectedDomain === "criminal_procedure") {
    blockedDomains.push("tort_law_hk", "probate_law_hk", "equity_trusts_hk", "hk_listing_and_listed_company_regulation");
  }
  if (selectedDomain === "personal_injury") {
    blockedDomains.push("probate_law_hk", "hk_listing_and_listed_company_regulation");
  }
  if (selectedDomain === "probate") {
    blockedDomains.push("tort_law_hk", "criminal_law_hk", "criminal_procedure_hk", "hk_listing_and_listed_company_regulation");
  }
  if (selectedDomain === "data_privacy") {
    blockedDomains.push("probate_law_hk", "tort_law_hk", "criminal_law_hk", "criminal_procedure_hk", "hk_listing_and_listed_company_regulation");
  }

  return {
    selected_domain: selectedDomain,
    scenario,
    task,
    posture,
    scores,
    confidence: maxScore >= 14 ? "high" : maxScore >= 8 ? "medium" : "low",
    allowed_static_domains: allowedStaticDomainsBySelected[selectedDomain] || [],
    blocked_static_domains: Array.from(new Set(blockedDomains)),
    strict_priority_applied: trace.some(item => item.includes("strict override")),
    trace,
  };
}

module.exports = {
  arbitrateLegalQuery,
};
