#!/usr/bin/env node
/**
 * Level 2+ AI Inquiry analysis-quality evaluation.
 *
 * Scores the composed research memo per query on 11 dimensions (0-5):
 *   issue_spotting, sub_issue_mapping, authority_relevance, quote_accuracy,
 *   use_of_facts, legal_application, missing_facts, distinguishing,
 *   answer_structure, depth_comprehensiveness, unsupported_domain_abstention.
 *
 * Pass requires: average >= 3.5, quote_accuracy = 5, abstention = 5,
 * and no wrong-case citation.
 */
const fs = require("fs");
const path = require("path");
const { composeResearchMemo } = require("../src/case_graph/research_memo_composer");

const ROOT = path.resolve(__dirname, "..");
const OUT_JSON = path.join(ROOT, "artifacts", "ai_inquiry_analysis_quality_report.json");
const OUT_MD = path.join(ROOT, "artifacts", "ai_inquiry_analysis_quality_report.md");

const QUERIES = [
  {
    id: "theft_forgot_to_pay",
    query: "I picked up goods in a shop, forgot to pay, and left. What theft issues matter?",
    expect_issue: /theft/i,
    expect_sub_issues: ["dishonesty", "appropriation"],
    forbid_cases: [/leung kwok hung/i, /tam tak chi/i],
    abstain_expected: false,
  },
  {
    id: "theft_intention_return",
    query: "What does intention permanently to deprive mean if I planned to return the item?",
    expect_issue: /theft/i,
    expect_sub_issues: ["intention_permanently_deprive"],
    forbid_cases: [/lai chee ying/i, /tam tak chi/i],
    abstain_expected: false,
  },
  {
    id: "theft_belonging_another",
    query: "The property was in someone else's possession, but I thought it was mine. What theft issue is this?",
    expect_issue: /theft/i,
    expect_sub_issues: ["belonging_to_another"],
    forbid_cases: [/tam tak chi/i],
    abstain_expected: false,
  },
  {
    id: "bail_after_theft",
    query: "What bail factors matter after a theft arrest?",
    expect_issue: /bail/i,
    expect_sub_issues: ["bail_factors"],
    expect_case: /lai chee ying/i,
    forbid_cases: [/tam tak chi/i],
    abstain_expected: false,
  },
  {
    id: "interview_no_rights",
    query: "The police interviewed me without explaining my rights. What issues matter?",
    expect_issue: /confession|admissib/i,
    expect_sub_issues: ["caution_rights"],
    expect_case: /lam tat ming/i,
    forbid_cases: [/leung kwok hung.*2005/i],
    abstain_expected: false,
  },
  {
    id: "peaceful_protest_route",
    query: "I joined a peaceful protest and police restricted the route. What legal issues matter?",
    expect_issue: /assembly|proportional/i,
    expect_sub_issues: ["peaceful_assembly", "proportionality"],
    expect_case: /leung kwok hung/i,
    forbid_cases: [/lam tat ming/i],
    abstain_expected: false,
  },
  {
    id: "landlord_rent",
    query: "My landlord increased my rent. What should I do?",
    abstain_expected: true,
  },
];

function clamp05(value) { return Math.max(0, Math.min(5, Math.round(value * 10) / 10)); }

function scoreQuery(spec) {
  const memo = composeResearchMemo(spec.query);
  const scores = {};
  const problems = [];

  // 11. unsupported-domain abstention (hard gate)
  if (spec.abstain_expected) {
    const noCriminalAuthority = (memo.authorities || []).length === 0 && (memo.paragraph_quotes || []).length === 0;
    const explains = /civil|corpus|no supported|abstain/i.test(memo.short_answer || "");
    scores.unsupported_domain_abstention = memo.abstain && noCriminalAuthority && explains ? 5 : 0;
    if (scores.unsupported_domain_abstention < 5) problems.push("abstention_failed");
    // Other dimensions are not applicable for the abstain query; score structure/abstention only.
    scores.answer_structure = memo.short_answer && memo.limitations?.length && memo.next_research_steps?.length ? 5 : 2;
    scores.quote_accuracy = 5; // no quotes claimed -> vacuously accurate
    return { spec, memo, scores, problems, wrong_case_citation: false };
  }
  scores.unsupported_domain_abstention = memo.abstain ? 0 : 5;
  if (memo.abstain) problems.push("unexpected_abstain");

  // 1. issue spotting
  scores.issue_spotting = (memo.issues || []).some(issue => spec.expect_issue.test(issue)) ? 5 : 0;
  if (!scores.issue_spotting) problems.push("expected_issue_missing");

  // 2. sub-issue mapping
  const subIssues = memo.sub_issues || [];
  const subHits = (spec.expect_sub_issues || []).filter(tag => subIssues.includes(tag));
  scores.sub_issue_mapping = spec.expect_sub_issues?.length
    ? clamp05(5 * (subHits.length / spec.expect_sub_issues.length))
    : (subIssues.length ? 5 : 3);
  if (scores.sub_issue_mapping < 3) problems.push("sub_issue_mapping_weak");

  // 3. authority relevance (+ wrong-case check)
  const authorityNames = (memo.authorities || []).map(auth => `${auth.case_name} ${auth.citation}`);
  let wrongCase = false;
  for (const forbid of spec.forbid_cases || []) {
    if (authorityNames.some(name => forbid.test(name))) {
      wrongCase = true;
      problems.push(`forbidden_case_cited:${forbid}`);
    }
  }
  const expectedOk = spec.expect_case ? authorityNames.some(name => spec.expect_case.test(name)) : true;
  scores.authority_relevance = wrongCase ? 0 : expectedOk ? (authorityNames.length ? 5 : 0) : 2;
  if (!expectedOk) problems.push("expected_case_missing");

  // 4. quote accuracy (hard gate): every quote must be a substring of its paragraph text
  const quotes = memo.paragraph_quotes || [];
  const badQuotes = quotes.filter(quote => !quote.exact_quote || !quote.paragraph_text || !quote.paragraph_text.includes(quote.exact_quote));
  scores.quote_accuracy = quotes.length && !badQuotes.length ? 5 : quotes.length ? 0 : 0;
  if (badQuotes.length) problems.push(`quote_not_in_paragraph:${badQuotes.length}`);
  if (!quotes.length) problems.push("no_paragraph_quotes");

  // 5. use of facts: application must quote fragments of the user's stated facts
  const application = memo.application_to_facts || "";
  const factEcho = /your stated facts \("[^"]{6,}"\)/.test(application);
  scores.use_of_facts = factEcho ? 5 : application.length > 80 ? 2 : 0;
  if (scores.use_of_facts < 3) problems.push("facts_not_used_in_application");

  // 6. legal application: application ties an authority (case name) to the facts
  const citesAuthorityInApplication = (memo.authorities || []).some(auth => application.includes(auth.case_name));
  const notesGapsHonestly = /research gap/i.test(application);
  scores.legal_application = citesAuthorityInApplication ? 5 : notesGapsHonestly ? 3 : application ? 2 : 0;
  if (scores.legal_application < 3) problems.push("no_authority_applied_to_facts");

  // 7. missing facts
  scores.missing_facts = (memo.missing_facts || []).length >= 3 ? 5 : (memo.missing_facts || []).length ? 3 : 0;

  // 8. distinguishing wrong authorities
  scores.distinguishing = (memo.distinguished_authorities || []).length
    ? ((memo.distinguished_authorities || []).every(d => d.reason) ? 5 : 3)
    : 3; // nothing off-issue retrieved is acceptable
  // 9. answer structure
  const sections = [
    memo.short_answer, (memo.issues || []).length, (memo.authorities || []).length,
    (memo.paragraph_quotes || []).length, (memo.legal_principles || []).length,
    memo.application_to_facts, (memo.missing_facts || []).length,
    (memo.limitations || []).length, (memo.next_research_steps || []).length,
  ];
  const present = sections.filter(Boolean).length;
  scores.answer_structure = clamp05(5 * (present / sections.length));

  // 10. depth / comprehensiveness
  const distinctCases = new Set((memo.authorities || []).map(auth => auth.case_name)).size;
  const principleCount = (memo.legal_principles || []).length;
  scores.depth_comprehensiveness = clamp05(
    (distinctCases >= 3 ? 2.5 : distinctCases >= 2 ? 2 : distinctCases ? 1 : 0) +
    (principleCount >= 2 ? 1.5 : principleCount ? 1 : 0) +
    (application.split("\n").length >= 2 ? 1 : 0.5),
  );

  return { spec, memo, scores, problems, wrong_case_citation: wrongCase };
}

function run() {
  const results = QUERIES.map(spec => {
    const { memo, scores, problems, wrong_case_citation } = scoreQuery(spec);
    const values = Object.values(scores);
    const average = values.reduce((sum, v) => sum + v, 0) / values.length;
    return {
      id: spec.id,
      query: spec.query,
      scores,
      average: Number(average.toFixed(2)),
      problems,
      wrong_case_citation,
      abstained: memo.abstain,
      authorities: (memo.authorities || []).map(auth => `${auth.case_name} ${auth.citation}`),
      distinguished: (memo.distinguished_authorities || []).map(d => d.case_name),
    };
  });

  const overallAverage = Number((results.reduce((sum, r) => sum + r.average, 0) / results.length).toFixed(2));
  const quoteAccuracyOk = results.every(r => r.scores.quote_accuracy === 5);
  const abstentionOk = results.filter(r => "unsupported_domain_abstention" in r.scores).every(r => r.scores.unsupported_domain_abstention === 5);
  const noWrongCase = results.every(r => !r.wrong_case_citation);
  const pass = overallAverage >= 3.5 && quoteAccuracyOk && abstentionOk && noWrongCase;

  const payload = {
    artifact_id: "ai_inquiry_analysis_quality_report_v1",
    generated_at: new Date().toISOString(),
    pass,
    overall_average: overallAverage,
    gates: {
      average_at_least_3_5: overallAverage >= 3.5,
      quote_accuracy_5_of_5: quoteAccuracyOk,
      unsupported_domain_abstention_5_of_5: abstentionOk,
      no_wrong_case_citation: noWrongCase,
    },
    results,
  };
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, `${JSON.stringify(payload, null, 2)}\n`);

  const dims = ["issue_spotting", "sub_issue_mapping", "authority_relevance", "quote_accuracy", "use_of_facts", "legal_application", "missing_facts", "distinguishing", "answer_structure", "depth_comprehensiveness", "unsupported_domain_abstention"];
  const md = [
    "# AI Inquiry Analysis Quality Report",
    "",
    `Generated: ${payload.generated_at}`,
    "",
    `Overall: **${pass ? "PASS" : "FAIL"}** · average ${overallAverage}/5 · quote accuracy ${quoteAccuracyOk ? "5/5" : "FAIL"} · abstention ${abstentionOk ? "5/5" : "FAIL"} · wrong-case citations: ${noWrongCase ? "none" : "PRESENT"}`,
    "",
    `| Query | Avg | ${dims.map(d => d.replace(/_/g, " ")).join(" | ")} |`,
    `| --- | --- | ${dims.map(() => "---").join(" | ")} |`,
    ...results.map(r => `| ${r.id} | ${r.average} | ${dims.map(d => r.scores[d] ?? "n/a").join(" | ")} |`),
    "",
    "## Problems",
    "",
    ...results.flatMap(r => r.problems.length ? [`- ${r.id}: ${r.problems.join("; ")}`] : []),
    "",
  ];
  fs.writeFileSync(OUT_MD, `${md.join("\n")}\n`);
  return payload;
}

if (require.main === module) {
  const payload = run();
  console.log(`analysis quality: ${payload.pass ? "PASS" : "FAIL"} (avg ${payload.overall_average}/5)`);
  for (const result of payload.results) {
    console.log(`  ${result.id}: avg ${result.average}${result.problems.length ? ` [${result.problems.join(", ")}]` : ""}`);
  }
  console.log(`written: ${OUT_JSON}`);
  if (!payload.pass) process.exit(1);
}

module.exports = { run };
