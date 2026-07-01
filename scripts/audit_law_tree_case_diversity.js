#!/usr/bin/env node
/* Audit law-tree case-fruit diversity before production-release merge. */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PACK_PATH = path.join(ROOT, "data", "legal_ingest", "case_corpus", "law_tree_case_fruit_packs.json");
const OUT_JSON = path.join(ROOT, "artifacts", "law_tree_case_diversity_report.json");
const OUT_MD = path.join(ROOT, "artifacts", "law_tree_case_diversity_report.md");
const GENERATED_AT = "2026-07-01T00:00:00+08:00";

const LEADING_CASE_CLUSTER_EXCEPTIONS = {
  "criminal_public_order.assembly_proportionality": {
    allowed: true,
    reason: "Narrow public-assembly/proportionality demo cluster currently rests on verified Leung Kwok Hung and Tong Wai Hung CFA/CA paragraph proof. Additional public authorities should be mined later, but the current display must group paragraphs by case.",
  },
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function write(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text);
}

function caseKey(item) {
  return [
    item.case_id || "",
    item.case_name || "",
    item.neutral_citation || item.citation || "",
    item.law_report_citation || "",
  ].join("|").toLowerCase();
}

function paragraphKey(item) {
  return [
    caseKey(item),
    item.para_no || item.paragraph_number || "",
    item.source_url || "",
    item.exact_quote || item.supporting_quote || "",
  ].join("|");
}

function hasRequiredProof(item) {
  const quote = item.exact_quote || item.supporting_quote || "";
  const summary = item.principle_text || item.sub_issue_summary || item.proposition_text || item.application_note || "";
  return Boolean(
    item.source_url &&
    /(?:hklii\.hk|legalref\.judiciary\.hk|judiciary\.hk)/i.test(item.source_url) &&
    /#p\d+/i.test(item.source_url) &&
    (item.para_no || item.paragraph_number) &&
    quote &&
    item.paragraph_text &&
    String(item.paragraph_text).includes(quote) &&
    summary
  );
}

function auditTree(tree) {
  const authorities = tree.verified_authorities || [];
  const byCase = new Map();
  const paragraphSeen = new Map();
  const repeatedParagraphs = [];
  const missingProof = [];

  for (const item of authorities) {
    const key = caseKey(item);
    if (!byCase.has(key)) {
      byCase.set(key, {
        case_name: item.case_name || "",
        citation: item.neutral_citation || item.citation || item.law_report_citation || "",
        paragraph_count: 0,
      });
    }
    byCase.get(key).paragraph_count += 1;

    const pKey = paragraphKey(item);
    if (paragraphSeen.has(pKey)) repeatedParagraphs.push({ case_name: item.case_name, source_url: item.source_url, para_no: item.para_no || item.paragraph_number });
    paragraphSeen.set(pKey, true);

    if (!hasRequiredProof(item)) {
      missingProof.push({
        case_name: item.case_name || "",
        citation: item.neutral_citation || item.citation || "",
        para_no: item.para_no || item.paragraph_number || "",
        source_url: item.source_url || "",
      });
    }
  }

  const cases = Array.from(byCase.values()).sort((a, b) => b.paragraph_count - a.paragraph_count || a.case_name.localeCompare(b.case_name));
  const totalParagraphCards = authorities.length;
  const distinctCases = cases.length;
  const topCase = cases[0] || null;
  const topCaseShare = totalParagraphCards ? Number((topCase.paragraph_count / totalParagraphCards).toFixed(4)) : 0;
  const exception = LEADING_CASE_CLUSTER_EXCEPTIONS[tree.tree_id] || null;
  const tooFewCases = distinctCases < 5;
  const overConcentrated = topCaseShare > 0.4;
  const passesThreshold =
    !missingProof.length &&
    !repeatedParagraphs.length &&
    (!tooFewCases || exception?.allowed) &&
    (!overConcentrated || exception?.allowed);

  return {
    tree_id: tree.tree_id,
    label: tree.label || tree.tree_id,
    total_paragraph_cards: totalParagraphCards,
    distinct_cases: distinctCases,
    top_case: topCase,
    top_case_share: topCaseShare,
    repeated_paragraphs: repeatedParagraphs,
    missing_required_proof: missingProof,
    grouped_display_required: true,
    leading_case_cluster_exception: exception || null,
    diversity_findings: {
      too_few_distinct_cases: tooFewCases,
      single_case_over_40_percent: overConcentrated,
      duplicate_paragraph_cards: repeatedParagraphs.length > 0,
      missing_url_para_quote_or_summary: missingProof.length > 0,
    },
    passes_diversity_threshold: passesThreshold,
  };
}

const pack = readJson(PACK_PATH);
const trees = (pack.trees || []).map(auditTree);
const pass = trees.every(tree => tree.passes_diversity_threshold);
const report = {
  report_id: "law_tree_case_diversity_audit_v1",
  generated_at: GENERATED_AT,
  pass,
  thresholds: {
    minimum_distinct_cases_where_available: 5,
    max_top_case_share_without_exception: 0.4,
    grouped_display_required: true,
  },
  trees,
  summary: {
    trees_audited: trees.length,
    trees_passing: trees.filter(tree => tree.passes_diversity_threshold).length,
    trees_with_leading_case_cluster_exception: trees.filter(tree => tree.leading_case_cluster_exception?.allowed).map(tree => tree.tree_id),
    weak_diversity_trees: trees.filter(tree => !tree.passes_diversity_threshold).map(tree => tree.tree_id),
  },
};

write(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`);
write(OUT_MD, [
  "# Law-Tree Case Diversity Audit",
  "",
  `Generated: ${report.generated_at}`,
  "",
  `Pass: **${report.pass ? "yes" : "no"}**`,
  "",
  "| Tree | Paragraphs | Distinct cases | Top case share | Result | Notes |",
  "|---|---:|---:|---:|---|---|",
  ...trees.map(tree => {
    const notes = [
      tree.leading_case_cluster_exception?.allowed ? "leading-case cluster exception" : "",
      tree.diversity_findings.too_few_distinct_cases ? "few cases" : "",
      tree.diversity_findings.single_case_over_40_percent ? "top case >40%" : "",
      tree.repeated_paragraphs.length ? `${tree.repeated_paragraphs.length} repeated paragraph(s)` : "",
      tree.missing_required_proof.length ? `${tree.missing_required_proof.length} missing proof item(s)` : "",
    ].filter(Boolean).join("; ") || "ok";
    return `| ${tree.tree_id} | ${tree.total_paragraph_cards} | ${tree.distinct_cases} | ${(tree.top_case_share * 100).toFixed(1)}% | ${tree.passes_diversity_threshold ? "pass" : "fail"} | ${notes.replace(/\|/g, "\\|")} |`;
  }),
  "",
  "Display rule: demo panels must group repeated paragraphs under one case card with a collapsed paragraph proof list.",
  "",
].join("\n"));

if (!pass) {
  console.error("Law-tree case diversity audit failed:");
  trees.filter(tree => !tree.passes_diversity_threshold).forEach(tree => {
    console.error(`- ${tree.tree_id}: distinct=${tree.distinct_cases}, top_share=${tree.top_case_share}`);
  });
  process.exit(1);
}

console.log(`Law-tree case diversity audit passed (${report.summary.trees_passing}/${report.summary.trees_audited}).`);
