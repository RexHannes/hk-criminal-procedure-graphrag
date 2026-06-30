#!/usr/bin/env node
/* Repair L3 principle quality without deleting demoted cards. */

const fs = require("fs");
const path = require("path");
const {
  ROOT,
  PATHS,
  readJsonl,
  writeJsonl,
  byId,
} = require("../src/legal_answer/case_corpus/case_corpus_store");
const {
  assessPrincipleQuality,
  principleUsable,
  quoteTooShort,
} = require("../src/legal_answer/case_corpus/principle_quality");

const OUT_JSON = path.join(ROOT, "artifacts", "principle_quality_repair_report.json");
const OUT_MD = path.join(ROOT, "artifacts", "principle_quality_repair_report.md");
const STATUS_JSON = path.join(ROOT, "artifacts", "case_corpus_l1_l35_status.json");
const STATUS_MD = path.join(ROOT, "artifacts", "case_corpus_l1_l35_status.md");

function countBy(records = [], keyFn) {
  const counts = {};
  for (const record of records) {
    const key = keyFn(record) || "none";
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function updateStatus(report) {
  const status = fs.existsSync(STATUS_JSON) ? JSON.parse(fs.readFileSync(STATUS_JSON, "utf8")) : {};
  status.principle_quality_repair = {
    repaired_at: report.generated_at,
    principle_card_count: report.summary.principle_card_count,
    usable_principle_count: report.summary.usable_principle_count,
    demoted_principle_count: report.summary.demoted_principle_count,
    needs_review_principle_count: report.summary.needs_review_principle_count,
    principle_quality_status_counts: report.summary.principle_quality_status_counts,
    demotion_reason_counts: report.summary.demotion_reason_counts,
    liability_relevance_counts: report.summary.liability_relevance_counts,
  };
  status.usable_principle_count = report.summary.usable_principle_count;
  status.demoted_principle_count = report.summary.demoted_principle_count;
  status.principle_quality_status_counts = report.summary.principle_quality_status_counts;
  status.principle_demotion_reason_counts = report.summary.demotion_reason_counts;
  fs.writeFileSync(STATUS_JSON, `${JSON.stringify(status, null, 2)}\n`, "utf8");

  if (fs.existsSync(STATUS_MD)) {
    const original = fs.readFileSync(STATUS_MD, "utf8").replace(/\n## Principle Quality Repair[\s\S]*?(?=\n## |\n?$)/m, "").trimEnd();
    const lines = [
      original,
      "",
      "## Principle Quality Repair",
      "",
      "| Metric | Value |",
      "|---|---:|",
      `| Principle cards | ${report.summary.principle_card_count} |`,
      `| Usable in research answer layer | ${report.summary.usable_principle_count} |`,
      `| Demoted / not answer-layer usable | ${report.summary.demoted_principle_count} |`,
      `| Needs review | ${report.summary.needs_review_principle_count} |`,
      "",
      "### Demotion Reasons",
      "",
      "| Reason | Count |",
      "|---|---:|",
      ...Object.entries(report.summary.demotion_reason_counts).map(([reason, count]) => `| ${reason} | ${count} |`),
      "",
    ];
    fs.writeFileSync(STATUS_MD, `${lines.join("\n")}`, "utf8");
  }
}

function expandQuote(principle = {}, paragraphById = new Map()) {
  const existing = String(principle.exact_quote_support || "").trim();
  if (!quoteTooShort(existing)) return existing;
  const paragraphs = (principle.source_paragraph_ids || []).map(id => paragraphById.get(id)).filter(Boolean);
  const paragraph = paragraphs.find(item => existing && (item.paragraph_text || "").includes(existing)) || paragraphs[0];
  const text = String(paragraph?.paragraph_text || "");
  if (!text) return existing;
  if (existing && text.includes(existing)) {
    const sentences = text.split(/(?<=[.!?])\s+/);
    const sentence = sentences.find(item => item.includes(existing));
    if (sentence && sentence.length >= 32) return sentence.slice(0, 220).trim();
    const index = text.indexOf(existing);
    return text.slice(Math.max(0, index - 40), Math.min(text.length, index + existing.length + 160)).trim();
  }
  return text.split(/\s+/).slice(0, 32).join(" ");
}

function main() {
  const paragraphs = readJsonl(PATHS.paragraphsSample);
  const propositions = readJsonl(PATHS.propositionsSample);
  const principles = readJsonl(PATHS.principlesSample);
  const issueMap = readJsonl(PATHS.issueMapSample);
  const digests = readJsonl(PATHS.digestsSample);
  const paragraphById = byId(paragraphs, "paragraph_id");
  const propositionById = byId(propositions, "proposition_id");

  const repairedPrinciples = principles.map(principle => {
    const quoteRepaired = {
      ...principle,
      exact_quote_support: expandQuote(principle, paragraphById),
    };
    const assessment = assessPrincipleQuality(quoteRepaired, { paragraphById, propositionById });
    return {
      ...quoteRepaired,
      principle_quality_status: assessment.principle_quality_status,
      demotion_reason: assessment.demotion_reason,
      demotion_reasons: assessment.demotion_reasons,
      liability_relevance: assessment.liability_relevance,
      usable_in_answer_layer: assessment.usable_in_answer_layer,
    };
  });
  const usablePrincipleIds = new Set(repairedPrinciples.filter(principleUsable).map(item => item.principle_id));
  const demotedPrinciples = repairedPrinciples.filter(item => item.principle_quality_status === "demoted");

  const repairedIssueMap = issueMap.map(item => ({
    ...item,
    principle_ids: (item.principle_ids || []).filter(id => usablePrincipleIds.has(id)),
    demoted_principle_ids: (item.principle_ids || []).filter(id => !usablePrincipleIds.has(id)),
  }));

  const repairedDigests = digests.map(digest => {
    const principleIds = digest.principle_ids || [];
    const usable = principleIds.filter(id => usablePrincipleIds.has(id));
    const demoted = principleIds.filter(id => !usablePrincipleIds.has(id));
    return {
      ...digest,
      principle_ids: usable,
      obiter_principles: (digest.obiter_principles || principleIds).filter(id => usablePrincipleIds.has(id)),
      ratio_principles: (digest.ratio_principles || []).filter(id => usablePrincipleIds.has(id)),
      demoted_principle_ids: demoted,
      holdings: [
        ...(digest.holdings || []).filter(item => !/Machine extraction identified public paragraphs/i.test(item)),
        "Machine extraction identified public paragraphs; demoted principles are preserved for audit and excluded from answer-layer principle links.",
        "No final ratio/current-treatment conclusion is made at L3.5.",
      ],
    };
  });

  writeJsonl(PATHS.principlesSample, repairedPrinciples);
  writeJsonl(PATHS.issueMapSample, repairedIssueMap);
  writeJsonl(PATHS.digestsSample, repairedDigests);

  const summary = {
    principle_card_count: repairedPrinciples.length,
    usable_principle_count: repairedPrinciples.filter(principleUsable).length,
    demoted_principle_count: demotedPrinciples.length,
    needs_review_principle_count: repairedPrinciples.filter(item => item.principle_quality_status === "needs_review").length,
    principle_quality_status_counts: countBy(repairedPrinciples, item => item.principle_quality_status),
    liability_relevance_counts: countBy(repairedPrinciples, item => item.liability_relevance),
    demotion_reason_counts: countBy(demotedPrinciples.flatMap(item => item.demotion_reasons || [item.demotion_reason]).map(reason => ({ reason })), item => item.reason),
  };
  const report = {
    report_id: "principle_quality_repair_v1",
    generated_at: "2026-06-30T00:00:00.000Z",
    scope: "Repairs current L1-L3.5 sample principle quality before 500-case scaling; demoted cards are preserved, not deleted.",
    summary,
    demoted_cards: demotedPrinciples.map(item => ({
      principle_id: item.principle_id,
      case_id: item.case_id,
      case_name: item.case_name,
      neutral_citation: item.neutral_citation,
      liability_relevance: item.liability_relevance,
      demotion_reasons: item.demotion_reasons || [],
      source_urls: item.source_urls || [],
    })),
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(OUT_MD, `${[
    "# Principle Quality Repair",
    "",
    report.scope,
    "",
    "| Metric | Value |",
    "|---|---:|",
    `| Principle cards | ${summary.principle_card_count} |`,
    `| Usable in research answer layer | ${summary.usable_principle_count} |`,
    `| Demoted / not answer-layer usable | ${summary.demoted_principle_count} |`,
    `| Needs review | ${summary.needs_review_principle_count} |`,
    "",
    "## Demotion Reasons",
    "",
    "| Reason | Count |",
    "|---|---:|",
    ...Object.entries(summary.demotion_reason_counts).map(([reason, count]) => `| ${reason} | ${count} |`),
    "",
    "## Boundary",
    "",
    "- Demoted cards remain in the principle JSONL for audit lineage.",
    "- Demoted cards are excluded from issue-map principle links and answer-layer principle chunks.",
    "- No card is promoted to answer_safe.",
    "",
  ].join("\n")}`, "utf8");
  updateStatus(report);
  console.log(JSON.stringify({ script: "repair_principle_quality", summary, status: "passed" }, null, 2));
}

main();
