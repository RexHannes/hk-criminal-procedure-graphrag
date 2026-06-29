#!/usr/bin/env node
/* Build the truthful public-case L1-L3.5 sample corpus from verified paragraph proof. */

const fs = require("fs");
const path = require("path");
const {
  ROOT,
  PATHS,
  ensureCaseCorpusDir,
  sha256NormalizedParagraphText,
  writeJsonl,
} = require("../src/legal_answer/case_corpus/case_corpus_store");

const APPLIED_PARAGRAPH_PATH = path.join(
  ROOT,
  "data",
  "legal_ingest",
  "applied_answer",
  "paragraph_cards",
  "part1_two_vertical_paragraph_cards.json"
);

const STATUS_JSON_PATH = path.join(ROOT, "artifacts", "case_corpus_l1_l35_status.json");
const STATUS_MD_PATH = path.join(ROOT, "artifacts", "case_corpus_l1_l35_status.md");

const CASES = [
  {
    case_id: "hk_hkcfa_2022_chan_kam_ching_facc_10_2021",
    case_name: "HKSAR v Chan Kam Ching",
    neutral_citation: "[2022] HKCFA 7",
    court: "Court of Final Appeal",
    judgment_date: "2022-04-14",
    source_url: "https://www.hklii.hk/en/cases/hkcfa/2022/7",
    legalref_url: "https://legalref.judiciary.hk/lrs/common/search/search_result_detail_frame.jsp?DIS=143540&QS=%2B&TP=JU&ILAN=en",
    source_system: "hklii",
    practice_area_candidates: ["criminal_law"],
    issue_seed_tags: ["criminal_law.theft", "criminal_law.theft.dishonesty", "criminal_law.theft.mens_rea"],
    ingestion_status: "l2_paragraph_sample_verified",
    source_visibility: "public",
    answer_layer_status: "research_only",
  },
  {
    case_id: "hk_hkcfi_2022_khan_altaf_hcma_604_2021",
    case_name: "HKSAR v Khan, Altaf",
    neutral_citation: "[2022] HKCFI 1220",
    court: "Court of First Instance",
    judgment_date: "2022-04-27",
    source_url: "https://www.hklii.hk/en/cases/hkcfi/2022/1220",
    legalref_url: "https://legalref.judiciary.hk/lrs/common/search/search_result_detail_frame.jsp?DIS=143779&QS=%2B&TP=JU&ILAN=en",
    source_system: "hklii",
    practice_area_candidates: ["criminal_law", "criminal_sentencing"],
    issue_seed_tags: ["criminal_law.theft", "criminal_law.theft.sentencing"],
    ingestion_status: "l2_paragraph_sample_verified",
    source_visibility: "public",
    answer_layer_status: "research_only",
  },
];

function loadAppliedParagraphs() {
  const artifact = JSON.parse(fs.readFileSync(APPLIED_PARAGRAPH_PATH, "utf8"));
  const caseById = new Map(CASES.map(item => [item.case_id, item]));
  return (artifact.paragraph_cards || []).map(card => {
    const sourceCase = caseById.get(card.case_id);
    return {
      paragraph_id: card.paragraph_id,
      case_id: card.case_id,
      case_name: card.case_name,
      neutral_citation: card.citation,
      court: card.court,
      judgment_date: card.date,
      para_no: String(card.para_no),
      paragraph_text: card.paragraph_text,
      source_url: card.source_url,
      source_system: sourceCase?.source_system || "hklii",
      checksum: sha256NormalizedParagraphText(card.paragraph_text),
      checksum_algorithm: "sha256_normalized_paragraph_text",
      issue_tags_candidate: card.issue_tags || [],
      authority_role_candidate: card.authority_role || "background",
      extraction_status: "deterministic_from_verified_part1_paragraph_card",
      verification_status: card.verification_status || "source_verified_public",
      answer_layer_status: "research_only",
      review_status: "machine_candidate",
    };
  });
}

function propositions() {
  return [
    {
      proposition_id: "prop_chan_p148_dishonesty_state_of_mind",
      proposition_text: "Dishonesty concerns a state-of-mind issue rather than mere deceit mechanics.",
      source_paragraph_ids: ["hk_hkcfa_2022_7_chan_kam_ching_p148"],
      case_id: "hk_hkcfa_2022_chan_kam_ching_facc_10_2021",
      case_name: "HKSAR v Chan Kam Ching",
      neutral_citation: "[2022] HKCFA 7",
      court: "Court of Final Appeal",
      para_refs: ["148"],
      exact_quote_support: "Dishonesty addresses a wholly different matter",
      issue_tags: ["criminal_law.theft.dishonesty", "criminal_law.theft.mens_rea"],
      legal_function: "test",
      authority_role_candidate: "ratio_candidate",
      extraction_method: "deterministic",
      confidence: 0.72,
      verification_status: "quote_verified_from_paragraph_card",
      answer_layer_status: "research_only",
      review_status: "machine_candidate",
    },
    {
      proposition_id: "prop_chan_p149_ghosh_hk_candidate",
      proposition_text: "The judgment records the Ghosh dishonesty test as the Hong Kong position at that time.",
      source_paragraph_ids: ["hk_hkcfa_2022_7_chan_kam_ching_p149"],
      case_id: "hk_hkcfa_2022_chan_kam_ching_facc_10_2021",
      case_name: "HKSAR v Chan Kam Ching",
      neutral_citation: "[2022] HKCFA 7",
      court: "Court of Final Appeal",
      para_refs: ["149"],
      exact_quote_support: "the Ghosh test for dishonesty represents the law in Hong Kong at present",
      issue_tags: ["criminal_law.theft.dishonesty", "criminal_law.theft.mens_rea"],
      legal_function: "test",
      authority_role_candidate: "ratio_candidate",
      extraction_method: "deterministic",
      confidence: 0.7,
      verification_status: "quote_verified_from_paragraph_card",
      answer_layer_status: "research_only",
      review_status: "machine_candidate",
    },
    {
      proposition_id: "prop_khan_p1_theft_charge_route",
      proposition_text: "Theft charge and appeal posture can be identified through the Theft Ordinance s.9 route.",
      source_paragraph_ids: ["hk_hkcfi_2022_1220_khan_altaf_p1"],
      case_id: "hk_hkcfi_2022_khan_altaf_hcma_604_2021",
      case_name: "HKSAR v Khan, Altaf",
      neutral_citation: "[2022] HKCFI 1220",
      court: "Court of First Instance",
      para_refs: ["1"],
      exact_quote_support: "offence of theft, contrary to section 9 of the Theft Ordinance, Cap 210",
      issue_tags: ["criminal_law.theft", "criminal_law.theft.sentencing"],
      legal_function: "procedure",
      authority_role_candidate: "procedural_history",
      extraction_method: "deterministic",
      confidence: 0.64,
      verification_status: "quote_verified_from_paragraph_card",
      answer_layer_status: "research_only",
      review_status: "machine_candidate",
    },
    {
      proposition_id: "prop_khan_p24_pickpocketing_sentence_context",
      proposition_text: "Pickpocketing theft may attract immediate custodial sentencing guidance, but this is not a shoplifting liability principle.",
      source_paragraph_ids: ["hk_hkcfi_2022_1220_khan_altaf_p24"],
      case_id: "hk_hkcfi_2022_khan_altaf_hcma_604_2021",
      case_name: "HKSAR v Khan, Altaf",
      neutral_citation: "[2022] HKCFI 1220",
      court: "Court of First Instance",
      para_refs: ["24"],
      exact_quote_support: "an immediate custodial sentence of 12 to 15 months after trial is appropriate for a first offender",
      issue_tags: ["criminal_law.theft.sentencing"],
      legal_function: "sentencing",
      authority_role_candidate: "sentencing_observation",
      extraction_method: "deterministic",
      confidence: 0.66,
      verification_status: "quote_verified_from_paragraph_card",
      answer_layer_status: "research_only",
      review_status: "machine_candidate",
    },
  ];
}

function principles() {
  return [
    {
      principle_id: "case_principle_chan_dishonesty_state_of_mind",
      principle_text: "Dishonesty should be treated as a mental-state issue when analysing criminal dishonesty, subject to current-treatment review.",
      source_type: "case",
      source_proposition_ids: ["prop_chan_p148_dishonesty_state_of_mind"],
      source_paragraph_ids: ["hk_hkcfa_2022_7_chan_kam_ching_p148"],
      source_card_ids: ["hk_hkcfa_2022_7_chan_kam_ching_p148_149"],
      exact_quote_support: "Dishonesty addresses a wholly different matter",
      issue_tags: ["criminal_law.theft.dishonesty", "criminal_law.theft.mens_rea"],
      applies_to: ["dishonesty analysis", "forgotten-payment mens rea triage"],
      required_facts: ["dishonesty_issue", "user_account_of_belief", "objective_evidence_of_conduct"],
      limits: "Chan Kam Ching is not a shoplifting case and does not by itself decide forgotten-payment liability.",
      distinguishable_when: "The dispute is purely actus reus, sentencing-only, or turns on shop-specific CCTV facts not considered in Chan.",
      authority_strength: "cfa",
      current_treatment_status: "unchecked",
      verification_status: "quote_verified_research_only",
      answer_layer_status: "research_only",
      review_status: "machine_candidate",
    },
    {
      principle_id: "case_principle_chan_ghosh_candidate",
      principle_text: "Chan Kam Ching records Ghosh as the Hong Kong dishonesty test at that time; current treatment must be checked before final advice.",
      source_type: "case",
      source_proposition_ids: ["prop_chan_p149_ghosh_hk_candidate"],
      source_paragraph_ids: ["hk_hkcfa_2022_7_chan_kam_ching_p149"],
      source_card_ids: ["hk_hkcfa_2022_7_chan_kam_ching_p148_149"],
      exact_quote_support: "the Ghosh test for dishonesty represents the law in Hong Kong at present",
      issue_tags: ["criminal_law.theft.dishonesty", "criminal_law.theft.mens_rea"],
      applies_to: ["dishonesty test research"],
      required_facts: ["dishonesty_issue", "current_authority_check"],
      limits: "Do not assert Ivey/Ghosh treatment without a current verified Hong Kong treatment card.",
      distinguishable_when: "The question does not require the dishonesty test or the issue is governed by a later checked authority.",
      authority_strength: "cfa",
      current_treatment_status: "unchecked",
      verification_status: "quote_verified_research_only",
      answer_layer_status: "research_only",
      review_status: "machine_candidate",
    },
    {
      principle_id: "case_principle_khan_theft_charge_route",
      principle_text: "Khan provides research-only offence-route context for theft under Cap. 210 s.9.",
      source_type: "case",
      source_proposition_ids: ["prop_khan_p1_theft_charge_route"],
      source_paragraph_ids: ["hk_hkcfi_2022_1220_khan_altaf_p1"],
      source_card_ids: ["hk_hkcfi_2022_1220_khan_altaf_p1_24"],
      exact_quote_support: "offence of theft, contrary to section 9 of the Theft Ordinance, Cap 210",
      issue_tags: ["criminal_law.theft"],
      applies_to: ["charge route", "theft procedural posture"],
      required_facts: ["charge", "procedural_posture"],
      limits: "This paragraph is procedural history, not a substantive liability holding.",
      distinguishable_when: "The user needs AR/MR liability analysis rather than charge-route identification.",
      authority_strength: "cfi",
      current_treatment_status: "unchecked",
      verification_status: "quote_verified_research_only",
      answer_layer_status: "research_only",
      review_status: "machine_candidate",
    },
    {
      principle_id: "case_principle_khan_pickpocketing_sentence_context",
      principle_text: "Khan gives pickpocketing sentencing context and should not be presented as a shoplifting forgotten-payment liability rule.",
      source_type: "case",
      source_proposition_ids: ["prop_khan_p24_pickpocketing_sentence_context"],
      source_paragraph_ids: ["hk_hkcfi_2022_1220_khan_altaf_p24"],
      source_card_ids: ["hk_hkcfi_2022_1220_khan_altaf_p1_24"],
      exact_quote_support: "an immediate custodial sentence of 12 to 15 months after trial is appropriate for a first offender",
      issue_tags: ["criminal_law.theft.sentencing"],
      applies_to: ["pickpocketing sentencing context"],
      required_facts: ["conviction", "offence_type", "sentence_posture"],
      limits: "Sentencing context is downstream of liability and is not a forgotten-payment defence principle.",
      distinguishable_when: "The case concerns ordinary shoplifting, liability, or mistake rather than pickpocketing sentence.",
      authority_strength: "cfi",
      current_treatment_status: "unchecked",
      verification_status: "quote_verified_research_only",
      answer_layer_status: "research_only",
      review_status: "machine_candidate",
    },
  ];
}

function digests() {
  return [
    {
      case_digest_card_id: "digest_chan_kam_ching_l35",
      case_id: "hk_hkcfa_2022_chan_kam_ching_facc_10_2021",
      case_name: "HKSAR v Chan Kam Ching",
      neutral_citation: "[2022] HKCFA 7",
      court: "Court of Final Appeal",
      judgment_date: "2022-04-14",
      source_url: "https://www.hklii.hk/en/cases/hkcfa/2022/7",
      legalref_url: "https://legalref.judiciary.hk/lrs/common/search/search_result_detail_frame.jsp?DIS=143540&QS=%2B&TP=JU&ILAN=en",
      facts_summary: "Forgery/fraud substitution appeal involving the relationship between deceit and dishonesty.",
      procedural_history: "Court of Final Appeal appeal from CACC No. 230 of 2019.",
      issues: ["Dishonesty as a state of mind", "Hong Kong dishonesty-test research"],
      holdings: [
        "Dishonesty is discussed as a distinct state-of-mind concept.",
        "The judgment records Ghosh as the Hong Kong dishonesty position at that time.",
      ],
      ratio_principles: ["case_principle_chan_dishonesty_state_of_mind", "case_principle_chan_ghosh_candidate"],
      obiter_principles: [],
      key_paragraphs: ["hk_hkcfa_2022_7_chan_kam_ching_p148", "hk_hkcfa_2022_7_chan_kam_ching_p149"],
      proposition_ids: ["prop_chan_p148_dishonesty_state_of_mind", "prop_chan_p149_ghosh_hk_candidate"],
      principle_ids: ["case_principle_chan_dishonesty_state_of_mind", "case_principle_chan_ghosh_candidate"],
      applies_when: ["A theft/fraud question turns on dishonesty as a mental-state concept."],
      distinguishable_when: ["The live issue is shoplifting-specific evidence, sentencing, or current post-Ivey treatment not checked here."],
      treatment: { current_treatment_status: "unchecked", note: "No L4 lawyer treatment review in this sample." },
      hklii_paragraph_urls: [
        "https://www.hklii.hk/en/cases/hkcfa/2022/7#p148",
        "https://www.hklii.hk/en/cases/hkcfa/2022/7#p149",
      ],
      answer_layer_status: "research_only",
      review_status: "lawyer_review_required",
    },
    {
      case_digest_card_id: "digest_khan_altaf_l35",
      case_id: "hk_hkcfi_2022_khan_altaf_hcma_604_2021",
      case_name: "HKSAR v Khan, Altaf",
      neutral_citation: "[2022] HKCFI 1220",
      court: "Court of First Instance",
      judgment_date: "2022-04-27",
      source_url: "https://www.hklii.hk/en/cases/hkcfi/2022/1220",
      legalref_url: "https://legalref.judiciary.hk/lrs/common/search/search_result_detail_frame.jsp?DIS=143779&QS=%2B&TP=JU&ILAN=en",
      facts_summary: "Magistracy appeal against conviction and sentence for pickpocketing theft.",
      procedural_history: "Appeal from ESCC 1886 of 2021; conviction appeal dismissed and sentence challenge rejected.",
      issues: ["Theft charge route", "Pickpocketing theft sentence context"],
      holdings: [
        "The court did not disturb the magistrate's factual evaluation.",
        "Pickpocketing theft sentencing context was treated separately from liability.",
      ],
      ratio_principles: ["case_principle_khan_pickpocketing_sentence_context"],
      obiter_principles: ["case_principle_khan_theft_charge_route"],
      key_paragraphs: ["hk_hkcfi_2022_1220_khan_altaf_p1", "hk_hkcfi_2022_1220_khan_altaf_p24"],
      proposition_ids: ["prop_khan_p1_theft_charge_route", "prop_khan_p24_pickpocketing_sentence_context"],
      principle_ids: ["case_principle_khan_theft_charge_route", "case_principle_khan_pickpocketing_sentence_context"],
      applies_when: ["A theft question needs offence/penalty context or sentencing boundary checks."],
      distinguishable_when: ["The user's case is forgotten-payment shoplifting liability rather than pickpocketing sentence."],
      treatment: { current_treatment_status: "unchecked", note: "No L4 lawyer treatment review in this sample." },
      hklii_paragraph_urls: [
        "https://www.hklii.hk/en/cases/hkcfi/2022/1220#p1",
        "https://www.hklii.hk/en/cases/hkcfi/2022/1220#p24",
      ],
      answer_layer_status: "research_only",
      review_status: "lawyer_review_required",
    },
  ];
}

function issueTaxonomy() {
  return {
    taxonomy_id: "issue_taxonomy_hk_law_v1",
    created_at: "2026-06-29",
    status: "sample_taxonomy_for_l1_l35_case_corpus",
    issues: [
      "criminal_law.theft",
      "criminal_law.theft.actus_reus",
      "criminal_law.theft.mens_rea",
      "criminal_law.theft.dishonesty",
      "criminal_law.theft.intention_permanently_deprive",
      "criminal_law.theft.appropriation",
      "criminal_law.theft.belonging_to_another",
      "criminal_law.theft.mistake_or_forgot_to_pay",
      "criminal_law.theft.sentencing",
      "criminal_procedure.interview_caution",
      "criminal_procedure.bail",
      "probate.intestacy",
      "probate.domicile",
      "probate.minors_statutory_trusts",
      "probate.letters_of_administration",
    ].map(issue_id => ({
      issue_id,
      label: issue_id.split(".").slice(-1)[0].replace(/_/g, " "),
      status: "taxonomy_seed",
    })),
  };
}

function issueMap() {
  return [
    {
      issue_id: "criminal_law.theft.dishonesty",
      case_id: "hk_hkcfa_2022_chan_kam_ching_facc_10_2021",
      paragraph_ids: ["hk_hkcfa_2022_7_chan_kam_ching_p148", "hk_hkcfa_2022_7_chan_kam_ching_p149"],
      proposition_ids: ["prop_chan_p148_dishonesty_state_of_mind", "prop_chan_p149_ghosh_hk_candidate"],
      principle_ids: ["case_principle_chan_dishonesty_state_of_mind", "case_principle_chan_ghosh_candidate"],
      relevance_score: 0.82,
      relevance_reason: "CFA paragraphs discuss dishonesty as state of mind and recorded HK Ghosh treatment.",
      source_status: "paragraph_quote_verified_research_only",
      review_status: "machine_candidate",
    },
    {
      issue_id: "criminal_law.theft.mens_rea",
      case_id: "hk_hkcfa_2022_chan_kam_ching_facc_10_2021",
      paragraph_ids: ["hk_hkcfa_2022_7_chan_kam_ching_p148"],
      proposition_ids: ["prop_chan_p148_dishonesty_state_of_mind"],
      principle_ids: ["case_principle_chan_dishonesty_state_of_mind"],
      relevance_score: 0.72,
      relevance_reason: "Dishonesty is a mens rea component for theft, but this is not shoplifting-specific.",
      source_status: "paragraph_quote_verified_research_only",
      review_status: "machine_candidate",
    },
    {
      issue_id: "criminal_law.theft.sentencing",
      case_id: "hk_hkcfi_2022_khan_altaf_hcma_604_2021",
      paragraph_ids: ["hk_hkcfi_2022_1220_khan_altaf_p24"],
      proposition_ids: ["prop_khan_p24_pickpocketing_sentence_context"],
      principle_ids: ["case_principle_khan_pickpocketing_sentence_context"],
      relevance_score: 0.67,
      relevance_reason: "CFI paragraph provides pickpocketing sentence context, not shoplifting liability.",
      source_status: "paragraph_quote_verified_research_only",
      review_status: "machine_candidate",
    },
    {
      issue_id: "criminal_law.theft",
      case_id: "hk_hkcfi_2022_khan_altaf_hcma_604_2021",
      paragraph_ids: ["hk_hkcfi_2022_1220_khan_altaf_p1"],
      proposition_ids: ["prop_khan_p1_theft_charge_route"],
      principle_ids: ["case_principle_khan_theft_charge_route"],
      relevance_score: 0.54,
      relevance_reason: "Paragraph confirms theft charge route under Cap. 210 s.9, but is procedural-history material.",
      source_status: "paragraph_quote_verified_research_only",
      review_status: "machine_candidate",
    },
  ];
}

function statusReport(records) {
  const paragraphAnchorCount = records.paragraphs.filter(item => /#p\d+/i.test(item.source_url || "")).length;
  const quoteSupportCount = records.propositions.filter(prop => {
    const paragraphs = prop.source_paragraph_ids.map(id => records.paragraphById.get(id)).filter(Boolean);
    return paragraphs.some(paragraph => paragraph.paragraph_text.includes(prop.exact_quote_support));
  }).length;
  const checksumPassCount = records.paragraphs.filter(item => item.checksum === sha256NormalizedParagraphText(item.paragraph_text)).length;
  const researchOnlyCount = []
    .concat(records.cases, records.paragraphs, records.propositions, records.principles, records.digests)
    .filter(item => item.answer_layer_status === "research_only").length;
  const lawyerReviewCount = records.digests.filter(item => item.review_status === "lawyer_review_required").length;
  return {
    status_id: "case_corpus_l1_l35_status_v1",
    generated_at: "2026-06-29T00:00:00.000Z",
    scope_note: "Truthful sample L1-L3.5 case corpus built from existing public paragraph cards; L4 answer-safe review is not implemented.",
    registry_case_count: records.cases.length,
    paragraphized_case_count: new Set(records.paragraphs.map(item => item.case_id)).size,
    paragraph_card_count: records.paragraphs.length,
    proposition_card_count: records.propositions.length,
    principle_card_count: records.principles.length,
    case_digest_card_count: records.digests.length,
    issue_mapped_case_count: new Set(records.issueMap.map(item => item.case_id)).size,
    paragraph_anchor_pass_rate: records.paragraphs.length ? paragraphAnchorCount / records.paragraphs.length : 0,
    quote_support_pass_rate: records.propositions.length ? quoteSupportCount / records.propositions.length : 0,
    checksum_pass_rate: records.paragraphs.length ? checksumPassCount / records.paragraphs.length : 0,
    answer_safe_count: 0,
    research_only_count: researchOnlyCount,
    lawyer_review_required_count: lawyerReviewCount,
    demo_vertical_coverage: {
      theft_shoplifting: "L1-L3.5 sample case-law corpus available with paragraph proof",
      probate_intestacy: "statute-first; no public probate case paragraph authority attached",
    },
    unsupported_general_query_policy: "unsupported_general_query must not assert final legal propositions.",
    layers: {
      L1: "case registry",
      L2: "exact paragraph cards with anchors/checksums",
      L3: "paragraph-backed proposition/principle cards",
      L35: "issue-mapped digest and research memo retrieval",
      L4: "not implemented; no answer-safe propositions",
    },
  };
}

function writeStatusMarkdown(report) {
  const lines = [
    "# Case Corpus L1-L3.5 Status",
    "",
    report.scope_note,
    "",
    "| Metric | Value |",
    "|---|---:|",
    `| Registry cases | ${report.registry_case_count} |`,
    `| Paragraphized cases | ${report.paragraphized_case_count} |`,
    `| Paragraph cards | ${report.paragraph_card_count} |`,
    `| Proposition cards | ${report.proposition_card_count} |`,
    `| Principle cards | ${report.principle_card_count} |`,
    `| Case digest cards | ${report.case_digest_card_count} |`,
    `| Issue-mapped cases | ${report.issue_mapped_case_count} |`,
    `| Paragraph anchor pass rate | ${report.paragraph_anchor_pass_rate} |`,
    `| Quote support pass rate | ${report.quote_support_pass_rate} |`,
    `| Checksum pass rate | ${report.checksum_pass_rate} |`,
    `| Answer-safe count | ${report.answer_safe_count} |`,
    `| Research-only count | ${report.research_only_count} |`,
    `| Lawyer-review-required count | ${report.lawyer_review_required_count} |`,
    "",
    "## Layer Boundary",
    "",
    "- L1 registry: implemented for the verified sample.",
    "- L2 paragraph proof: implemented for public HKLII paragraph cards with anchors and checksums.",
    "- L3 proposition/principle extraction: implemented as deterministic research-only machine candidates.",
    "- L3.5 issue-mapped case digest and memo retrieval: implemented for the sample.",
    "- L4 answer-safe review: not implemented.",
    "",
    "## Demo Vertical Coverage",
    "",
    `- Theft/shoplifting: ${report.demo_vertical_coverage.theft_shoplifting}`,
    `- Probate intestacy: ${report.demo_vertical_coverage.probate_intestacy}`,
    "",
    "## Forbidden Claim",
    "",
    "Do not describe this sample as 10k answer-safe propositions, whole HK legal RAG, or final legal advice.",
    "",
  ];
  fs.mkdirSync(path.dirname(STATUS_MD_PATH), { recursive: true });
  fs.writeFileSync(STATUS_MD_PATH, `${lines.join("\n")}\n`, "utf8");
}

(function main() {
  ensureCaseCorpusDir();
  const paragraphs = loadAppliedParagraphs();
  const props = propositions();
  const prins = principles();
  const caseDigests = digests();
  const map = issueMap();
  const paragraphById = new Map(paragraphs.map(item => [item.paragraph_id, item]));
  const records = { cases: CASES, paragraphs, propositions: props, principles: prins, digests: caseDigests, issueMap: map, paragraphById };

  writeJsonl(PATHS.registryFull, CASES);
  writeJsonl(PATHS.registrySample, CASES);
  writeJsonl(PATHS.paragraphsSample, paragraphs);
  writeJsonl(PATHS.propositionsSample, props);
  writeJsonl(PATHS.principlesSample, prins);
  writeJsonl(PATHS.digestsSample, caseDigests);
  writeJsonl(PATHS.issueMapSample, map);
  fs.writeFileSync(PATHS.issueTaxonomy, `${JSON.stringify(issueTaxonomy(), null, 2)}\n`, "utf8");

  const report = statusReport(records);
  fs.mkdirSync(path.dirname(STATUS_JSON_PATH), { recursive: true });
  fs.writeFileSync(STATUS_JSON_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeStatusMarkdown(report);

  console.log(`Built L1-L3.5 case corpus sample: ${CASES.length} cases, ${paragraphs.length} paragraphs, ${props.length} propositions.`);
})();
