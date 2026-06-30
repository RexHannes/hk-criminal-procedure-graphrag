#!/usr/bin/env node
/* Build the public criminal-law L1-L3.5 sample corpus from committed HKLII proof. */

const fs = require("fs");
const path = require("path");
const {
  ROOT,
  PATHS,
  CASE_CORPUS_DIR,
  ensureCaseCorpusDir,
  sha256NormalizedParagraphText,
  writeJsonl,
} = require("../src/legal_answer/case_corpus/case_corpus_store");

const SOURCE_ARTIFACT_PATH = path.join(CASE_CORPUS_DIR, "criminal_sample_source_cases.json");
const STATUS_JSON_PATH = path.join(ROOT, "artifacts", "case_corpus_l1_l35_status.json");
const STATUS_MD_PATH = path.join(ROOT, "artifacts", "case_corpus_l1_l35_status.md");
const DEMO_OUT_DIR = path.join(ROOT, "artifacts", "demo_outputs");

const REQUIRED_ISSUES = [
  "criminal_law.theft",
  "criminal_law.theft.dishonesty",
  "criminal_law.theft.mens_rea",
  "criminal_law.theft.appropriation",
  "criminal_law.theft.intention_permanently_deprive",
  "criminal_law.theft.belonging_to_another",
  "criminal_law.theft.mistake_or_forgot_to_pay",
  "criminal_law.theft.sentencing",
  "criminal_law.fraud",
  "criminal_law.deception",
  "criminal_law.dishonesty",
  "criminal_procedure.interview_caution",
  "criminal_procedure.bail",
  "probate.intestacy",
  "probate.domicile",
  "probate.minors_statutory_trusts",
  "probate.letters_of_administration",
];

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function readSourceArtifact() {
  if (!fs.existsSync(SOURCE_ARTIFACT_PATH)) {
    throw new Error(`Missing source artifact: ${path.relative(ROOT, SOURCE_ARTIFACT_PATH)}. Run scripts/expand_case_corpus_criminal_sample.js first.`);
  }
  const artifact = JSON.parse(fs.readFileSync(SOURCE_ARTIFACT_PATH, "utf8"));
  if (!Array.isArray(artifact.cases)) throw new Error("criminal_sample_source_cases.json must contain cases[]");
  return artifact;
}

function authorityStrength(court = "") {
  if (/Final Appeal/i.test(court)) return "cfa";
  if (/Appeal/i.test(court)) return "ca";
  if (/First Instance|High Court/i.test(court)) return "cfi";
  if (/District/i.test(court)) return "dc";
  if (/Magistr/i.test(court)) return "magistracy";
  if (/Tribunal/i.test(court)) return "tribunal";
  return "cfi";
}

function normalizeAuthorityRole(role = "") {
  if (role === "case_application") return "application_to_facts";
  return role || "background";
}

function issueLabel(issueId = "") {
  return String(issueId || "").split(".").slice(-1)[0].replace(/_/g, " ");
}

function stableScore(issueId = "") {
  if (/dishonesty|mens_rea/.test(issueId)) return 0.84;
  if (/deception|fraud/.test(issueId)) return 0.8;
  if (/sentencing/.test(issueId)) return 0.72;
  if (/interview_caution|procedure/.test(issueId)) return 0.7;
  if (/theft/.test(issueId)) return 0.68;
  return 0.55;
}

function appliesWhen(issueTags = []) {
  const tags = new Set(issueTags);
  const applies = [];
  if (tags.has("criminal_law.theft.dishonesty") || tags.has("criminal_law.dishonesty")) {
    applies.push("A theft, fraud or deception question turns on dishonesty or mens rea.");
  }
  if (tags.has("criminal_law.theft.sentencing")) applies.push("The user needs sentencing context after liability is established or admitted.");
  if (tags.has("criminal_procedure.interview_caution")) applies.push("The case involves caution/interview material relevant to evidence triage.");
  if (tags.has("criminal_law.fraud") || tags.has("criminal_law.deception")) applies.push("The question involves deception, fraud, or obtaining property by deception.");
  if (!applies.length) applies.push("The question involves theft or theft-linked criminal-law context.");
  return applies;
}

function requiredFacts(issueTags = []) {
  const facts = new Set(["charge_or_suspected_offence", "procedural_posture", "full_fact_record"]);
  if (issueTags.includes("criminal_law.theft.dishonesty") || issueTags.includes("criminal_law.dishonesty")) {
    facts.add("accused_state_of_mind");
    facts.add("objective_conduct_evidence");
  }
  if (issueTags.includes("criminal_law.theft.mistake_or_forgot_to_pay")) {
    facts.add("payment_or_distraction_evidence");
    facts.add("immediate_offer_to_pay");
  }
  if (issueTags.includes("criminal_procedure.interview_caution")) facts.add("interview_record_and_caution_context");
  if (issueTags.includes("criminal_law.theft.sentencing")) facts.add("conviction_or_plea_status");
  return Array.from(facts);
}

function paragraphId(caseId, paraNo) {
  return `${caseId}_p${paraNo}`;
}

function propositionId(caseId, paraNo) {
  return `${caseId}_p${paraNo}_prop`;
}

function principleId(caseId, paraNo) {
  return `${caseId}_p${paraNo}_principle`;
}

function digestId(caseId) {
  return `${caseId}_digest_l35`;
}

function buildRegistry(cases) {
  return cases.map(item => ({
    case_id: item.case_id,
    case_name: item.case_name,
    neutral_citation: item.neutral_citation,
    court: item.court,
    judgment_date: item.judgment_date,
    source_url: item.source_url,
    legalref_url: item.legalref_url || "",
    source_system: item.source_system || "hklii",
    practice_area_candidates: item.practice_area_candidates || ["criminal_law"],
    issue_seed_tags: Array.from(new Set(item.issue_seed_tags || [])),
    ingestion_status: item.ingestion_status || "l2_paragraph_sample_verified",
    source_visibility: "public",
    answer_layer_status: "research_only",
  }));
}

function buildParagraphs(cases) {
  const paragraphs = [];
  for (const item of cases) {
    for (const paragraph of item.selected_paragraphs || []) {
      paragraphs.push({
        paragraph_id: paragraphId(item.case_id, paragraph.para_no),
        case_id: item.case_id,
        case_name: item.case_name,
        neutral_citation: item.neutral_citation,
        court: item.court,
        judgment_date: item.judgment_date,
        para_no: String(paragraph.para_no),
        paragraph_text: paragraph.paragraph_text,
        source_url: paragraph.source_url,
        source_system: item.source_system || "hklii",
        checksum: paragraph.checksum || sha256NormalizedParagraphText(paragraph.paragraph_text),
        checksum_algorithm: "sha256_normalized_paragraph_text",
        issue_tags_candidate: Array.from(new Set(paragraph.issue_tags_candidate || item.issue_seed_tags || [])),
        authority_role_candidate: normalizeAuthorityRole(paragraph.authority_role_candidate),
        extraction_status: "deterministic_from_committed_hklii_source_artifact",
        verification_status: "source_verified_public",
        answer_layer_status: "research_only",
        review_status: "machine_candidate",
      });
    }
  }
  return paragraphs;
}

function buildPropositions(cases) {
  const propositions = [];
  for (const item of cases) {
    for (const paragraph of item.selected_paragraphs || []) {
      const issueTags = Array.from(new Set(paragraph.issue_tags_candidate || item.issue_seed_tags || ["criminal_law.theft"]));
      propositions.push({
        proposition_id: propositionId(item.case_id, paragraph.para_no),
        proposition_text: paragraph.proposition_text,
        source_paragraph_ids: [paragraphId(item.case_id, paragraph.para_no)],
        case_id: item.case_id,
        case_name: item.case_name,
        neutral_citation: item.neutral_citation,
        court: item.court,
        para_refs: [String(paragraph.para_no)],
        source_urls: [paragraph.source_url],
        exact_quote_support: paragraph.exact_quote_support,
        issue_tags: issueTags,
        legal_function: paragraph.legal_function || "case_application",
        authority_role_candidate: normalizeAuthorityRole(paragraph.authority_role_candidate || "application_to_facts"),
        extraction_method: "deterministic_term_and_quote_extraction",
        confidence: 0.62,
        verification_status: "quote_verified_from_paragraph_card",
        answer_layer_status: "research_only",
        review_status: "machine_candidate",
      });
    }
  }
  return propositions;
}

function buildPrinciples(cases) {
  const principles = [];
  for (const item of cases) {
    for (const paragraph of item.selected_paragraphs || []) {
      const issueTags = Array.from(new Set(paragraph.issue_tags_candidate || item.issue_seed_tags || ["criminal_law.theft"]));
      principles.push({
        principle_id: principleId(item.case_id, paragraph.para_no),
        principle_text: paragraph.principle_text,
        source_type: "case",
        source_proposition_ids: [propositionId(item.case_id, paragraph.para_no)],
        source_paragraph_ids: [paragraphId(item.case_id, paragraph.para_no)],
        source_urls: [paragraph.source_url],
        exact_quote_support: paragraph.exact_quote_support,
        issue_tags: issueTags,
        applies_to: appliesWhen(issueTags),
        required_facts: requiredFacts(issueTags),
        limits: "Machine-extracted from selected paragraph text only; verify the whole judgment, issue posture and later treatment before relying on it.",
        distinguishable_when: "The user's facts, charge, mental-state evidence, procedural stage or sentencing posture differ from the selected public judgment context.",
        authority_strength: authorityStrength(item.court),
        current_treatment_status: "unchecked",
        case_id: item.case_id,
        case_name: item.case_name,
        neutral_citation: item.neutral_citation,
        court: item.court,
        verification_status: "quote_verified_research_only",
        answer_layer_status: "research_only",
        review_status: "machine_candidate",
      });
    }
  }
  return principles;
}

function buildDigests(cases, propositions, principles) {
  const propsByCase = new Map();
  const principlesByCase = new Map();
  for (const proposition of propositions) {
    if (!propsByCase.has(proposition.case_id)) propsByCase.set(proposition.case_id, []);
    propsByCase.get(proposition.case_id).push(proposition);
  }
  for (const principle of principles) {
    if (!principlesByCase.has(principle.case_id)) principlesByCase.set(principle.case_id, []);
    principlesByCase.get(principle.case_id).push(principle);
  }

  return cases.map(item => {
    const caseProps = propsByCase.get(item.case_id) || [];
    const casePrinciples = principlesByCase.get(item.case_id) || [];
    const keyParagraphs = (item.selected_paragraphs || []).map(paragraph => paragraphId(item.case_id, paragraph.para_no));
    const issueTags = Array.from(new Set(caseProps.flatMap(prop => prop.issue_tags || [])));
    const charge = item.search_metadata?.charge || "";
    return {
      case_digest_card_id: digestId(item.case_id),
      case_id: item.case_id,
      case_name: item.case_name,
      neutral_citation: item.neutral_citation,
      court: item.court,
      judgment_date: item.judgment_date,
      source_url: item.source_url,
      legalref_url: item.legalref_url || "",
      facts_summary: charge
        ? `Public HKLII criminal judgment involving: ${charge}`
        : `Public HKLII criminal judgment mapped to ${issueTags.slice(0, 4).join(", ")}.`,
      procedural_history: `${item.court} public judgment dated ${item.judgment_date}; action number ${item.search_metadata?.action_no || "not extracted"}. Procedural posture requires full-judgment review.`,
      issues: issueTags.map(issueLabel),
      holdings: [
        "Machine extraction identified public paragraphs relevant to the listed issues.",
        "No final ratio/current-treatment conclusion is made at L3.5.",
      ],
      ratio_principles: [],
      obiter_principles: casePrinciples.map(principle => principle.principle_id),
      key_paragraphs: keyParagraphs,
      proposition_ids: caseProps.map(prop => prop.proposition_id),
      principle_ids: casePrinciples.map(principle => principle.principle_id),
      applies_when: appliesWhen(issueTags),
      distinguishable_when: [
        "The charge, facts, evidence route, procedural posture or sentencing context is materially different.",
        "The selected paragraph is only background/procedure/sentencing context rather than a checked liability holding.",
      ],
      treatment: {
        current_treatment_status: "unchecked",
        note: "No L4 lawyer treatment review in this sample.",
      },
      hklii_paragraph_urls: (item.selected_paragraphs || []).map(paragraph => paragraph.source_url),
      answer_layer_status: "research_only",
      review_status: "lawyer_review_required",
    };
  });
}

function buildIssueTaxonomy(issueIds) {
  const all = Array.from(new Set([...REQUIRED_ISSUES, ...issueIds])).sort();
  return {
    taxonomy_id: "issue_taxonomy_hk_law_v1",
    created_at: "2026-06-29",
    status: "sample_taxonomy_for_l1_l35_case_corpus",
    issues: all.map(issue_id => ({
      issue_id,
      label: issueLabel(issue_id),
      status: issue_id.startsWith("criminal_") ? "sample_supported_research_only" : "taxonomy_seed",
    })),
  };
}

function buildIssueMap(cases) {
  const records = [];
  for (const item of cases) {
    const byIssue = new Map();
    for (const paragraph of item.selected_paragraphs || []) {
      for (const issueId of paragraph.issue_tags_candidate || []) {
        if (!byIssue.has(issueId)) {
          byIssue.set(issueId, {
            paragraph_ids: [],
            proposition_ids: [],
            principle_ids: [],
          });
        }
        const bucket = byIssue.get(issueId);
        bucket.paragraph_ids.push(paragraphId(item.case_id, paragraph.para_no));
        bucket.proposition_ids.push(propositionId(item.case_id, paragraph.para_no));
        bucket.principle_ids.push(principleId(item.case_id, paragraph.para_no));
      }
    }
    for (const [issueId, bucket] of byIssue.entries()) {
      records.push({
        issue_id: issueId,
        case_id: item.case_id,
        paragraph_ids: Array.from(new Set(bucket.paragraph_ids)),
        proposition_ids: Array.from(new Set(bucket.proposition_ids)),
        principle_ids: Array.from(new Set(bucket.principle_ids)),
        relevance_score: stableScore(issueId),
        relevance_reason: `${item.case_name} has selected public HKLII paragraph proof for ${issueId}; extraction remains research-only and lawyer-review-required.`,
        source_status: "paragraph_quote_verified_research_only",
        review_status: "machine_candidate",
      });
    }
  }
  return records.sort((a, b) => a.issue_id.localeCompare(b.issue_id) || b.relevance_score - a.relevance_score);
}

function countBy(records, keyFn) {
  const counts = {};
  for (const record of records) {
    const key = keyFn(record) || "unknown";
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function statusReport(sourceArtifact, records) {
  const paragraphAnchorCount = records.paragraphs.filter(item => /#p\d+$/i.test(item.source_url || "")).length;
  const quoteSupportCount = records.propositions.filter(prop => {
    const text = prop.source_paragraph_ids.map(id => records.paragraphById.get(id)?.paragraph_text || "").join(" ");
    return text.includes(prop.exact_quote_support || "");
  }).length;
  const checksumPassCount = records.paragraphs.filter(item => item.checksum === sha256NormalizedParagraphText(item.paragraph_text)).length;
  const allRecords = [].concat(records.cases, records.paragraphs, records.propositions, records.principles, records.digests);
  const researchOnlyCount = allRecords.filter(item => item.answer_layer_status === "research_only").length;
  const lawyerReviewCount = allRecords.filter(item => item.review_status === "lawyer_review_required").length;
  const issueCoverage = countBy(records.issueMap, item => item.issue_id);

  return {
    status_id: "case_corpus_l1_l35_status_v1",
    generated_at: "2026-06-29T00:00:00.000Z",
    scope_note: `This is a real L1-L3.5 public criminal-law sample corpus with ${records.cases.length} HKLII-verified cases. It is not 10k answer-safe and L4 is not implemented.`,
    source_artifact: "data/legal_ingest/case_corpus/criminal_sample_source_cases.json",
    source_artifact_case_count: sourceArtifact.actual_case_count,
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
    answer_safe_count: allRecords.filter(item => item.answer_layer_status === "answer_safe").length,
    research_only_count: researchOnlyCount,
    lawyer_review_required_count: lawyerReviewCount,
    top_issue_coverage: Object.entries(issueCoverage).slice(0, 12).map(([issue_id, case_count]) => ({ issue_id, case_count })),
    cases_by_court: countBy(records.cases, item => item.court),
    cases_by_year: countBy(records.cases, item => String(item.judgment_date || "").slice(0, 4)),
    extraction_limitations: sourceArtifact.extraction_limitations || [
      "Automated extraction remains research-only.",
      "No current-treatment review has been performed.",
    ],
    next_scale_target: {
      target: "Expand from this verified sample toward 500 then 10,000 L1/L2 cases only after adding reviewer gates and stronger current-treatment checks.",
      safe_claim: "Validated L1-L3.5 sample corpus; not a 10k answer-safe corpus.",
    },
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

function markdownTable(rows) {
  return rows.join("\n");
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
    "## Top Issue Coverage",
    "",
    "| Issue | Cases |",
    "|---|---:|",
    ...report.top_issue_coverage.map(item => `| ${item.issue_id} | ${item.case_count} |`),
    "",
    "## Cases By Court",
    "",
    "| Court | Cases |",
    "|---|---:|",
    ...Object.entries(report.cases_by_court).map(([court, count]) => `| ${court} | ${count} |`),
    "",
    "## Cases By Year",
    "",
    "| Year | Cases |",
    "|---|---:|",
    ...Object.entries(report.cases_by_year).map(([year, count]) => `| ${year} | ${count} |`),
    "",
    "## Extraction Limitations",
    "",
    ...report.extraction_limitations.map(item => `- ${item}`),
    "",
    "## Next Scale Target",
    "",
    `- ${report.next_scale_target.target}`,
    `- Safe claim: ${report.next_scale_target.safe_claim}`,
    "",
    "## Layer Boundary",
    "",
    "- L1 registry: implemented for the verified sample.",
    "- L2 paragraph proof: implemented for public HKLII paragraph cards with anchors and checksums.",
    "- L3 proposition/principle extraction: implemented as deterministic research-only machine candidates.",
    "- L3.5 issue-mapped case digest and memo retrieval: implemented for the sample.",
    "- L4 answer-safe review: not implemented.",
    "",
    "## Forbidden Claim",
    "",
    "Do not describe this sample as 10k answer-safe propositions, whole HK legal RAG, final legal advice, full lawyer-reviewed treatment, or automated media/OCR evidence analysis.",
    "",
  ];
  fs.mkdirSync(path.dirname(STATUS_MD_PATH), { recursive: true });
  fs.writeFileSync(STATUS_MD_PATH, `${lines.join("\n")}\n`, "utf8");
}

function writeAuthorityTables(records) {
  fs.mkdirSync(DEMO_OUT_DIR, { recursive: true });
  const digestByCase = new Map(records.digests.map(item => [item.case_id, item]));
  const rows = records.cases.map(item => {
    const digest = digestByCase.get(item.case_id);
    const issues = (item.issue_seed_tags || []).slice(0, 5).join(", ");
    const firstUrl = digest?.hklii_paragraph_urls?.[0] || item.source_url;
    return `| ${item.case_name} | ${item.neutral_citation} | ${item.court} | ${item.judgment_date} | ${issues} | ${firstUrl} |`;
  });
  const header = [
    "| Case | Citation | Court | Date | Issue tags | First paragraph proof |",
    "|---|---|---|---|---|---|",
  ];
  fs.writeFileSync(
    path.join(DEMO_OUT_DIR, "case_corpus_sample_authorities_table.md"),
    `${markdownTable(["# Case Corpus Sample Authorities", "", `Actual cases: ${records.cases.length}. All research-only and lawyer-review-required.`, "", ...header, ...rows])}\n`,
    "utf8"
  );

  const theftRows = records.cases
    .filter(item => (item.issue_seed_tags || []).some(tag => /theft|dishonesty|fraud|deception/i.test(tag)))
    .slice(0, 40)
    .map(item => {
      const digest = digestByCase.get(item.case_id);
      return `| ${item.case_name} | ${item.neutral_citation} | ${(item.issue_seed_tags || []).slice(0, 4).join(", ")} | ${digest?.hklii_paragraph_urls?.[0] || item.source_url} |`;
    });
  fs.writeFileSync(
    path.join(DEMO_OUT_DIR, "theft_dishonesty_case_law_table.md"),
    `${markdownTable(["# Theft/Dishonesty Case-Law Table", "", `Actual listed cases: ${theftRows.length}. All entries are public-source research-only candidates.`, "", "| Case | Citation | Issue tags | Paragraph proof |", "|---|---|---|---|", ...theftRows])}\n`,
    "utf8"
  );
}

(function main() {
  ensureCaseCorpusDir();
  const minCases = Number(argValue("--min-cases", "25"));
  const sourceArtifact = readSourceArtifact();
  const sourceCases = sourceArtifact.cases || [];
  if (sourceCases.length < minCases) {
    throw new Error(`Source artifact contains ${sourceCases.length} case(s), below minimum ${minCases}.`);
  }

  const cases = buildRegistry(sourceCases);
  const paragraphs = buildParagraphs(sourceCases);
  const propositions = buildPropositions(sourceCases);
  const principles = buildPrinciples(sourceCases);
  const digests = buildDigests(sourceCases, propositions, principles);
  const issueMap = buildIssueMap(sourceCases);
  const paragraphById = new Map(paragraphs.map(item => [item.paragraph_id, item]));
  const issueIds = Array.from(new Set(issueMap.map(item => item.issue_id).concat(cases.flatMap(item => item.issue_seed_tags || []))));

  const records = { cases, paragraphs, propositions, principles, digests, issueMap, paragraphById };

  writeJsonl(PATHS.registryFull, cases);
  writeJsonl(PATHS.registrySample, cases);
  writeJsonl(PATHS.paragraphsSample, paragraphs);
  writeJsonl(PATHS.propositionsSample, propositions);
  writeJsonl(PATHS.principlesSample, principles);
  writeJsonl(PATHS.digestsSample, digests);
  writeJsonl(PATHS.issueMapSample, issueMap);
  fs.writeFileSync(PATHS.issueTaxonomy, `${JSON.stringify(buildIssueTaxonomy(issueIds), null, 2)}\n`, "utf8");

  const report = statusReport(sourceArtifact, records);
  fs.mkdirSync(path.dirname(STATUS_JSON_PATH), { recursive: true });
  fs.writeFileSync(STATUS_JSON_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeStatusMarkdown(report);
  writeAuthorityTables(records);

  console.log(`Built L1-L3.5 case corpus sample: ${cases.length} cases, ${paragraphs.length} paragraphs, ${propositions.length} propositions.`);
})();
