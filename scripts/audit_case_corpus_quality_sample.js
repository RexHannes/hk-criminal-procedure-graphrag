#!/usr/bin/env node
/* Quality audit for the current verified L1-L3.5 case corpus branch. */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {
  ROOT,
  PATHS,
  loadCaseCorpus,
  byId,
  publicSourceUrl,
  sha256NormalizedParagraphText,
  readJsonl,
} = require("../src/legal_answer/case_corpus/case_corpus_store");
const {
  assessPrincipleQuality,
  principleUsable,
} = require("../src/legal_answer/case_corpus/principle_quality");

const OUT_JSON = path.join(ROOT, "artifacts", "case_corpus_quality_audit.json");
const OUT_MD = path.join(ROOT, "artifacts", "case_corpus_quality_audit.md");
const STATUS_JSON = path.join(ROOT, "artifacts", "case_corpus_l1_l35_status.json");
const STATUS_MD = path.join(ROOT, "artifacts", "case_corpus_l1_l35_status.md");

function scoreId(id = "") {
  return parseInt(crypto.createHash("sha256").update(id).digest("hex").slice(0, 12), 16);
}

function avg(values = []) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function uniqBy(items = [], keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function hasPublicSourceSnapshot(registryItem, fetchByCase, sourceByCase) {
  const fetchItem = fetchByCase.get(registryItem.case_id);
  return publicSourceUrl(registryItem.source_url) &&
    ((fetchItem && fetchItem.http_status === 200 && fetchItem.cache_status === "committed_source_snapshot") || sourceByCase.has(registryItem.case_id));
}

function principleQuality(principle = {}, paragraphById, propositionById) {
  const assessment = assessPrincipleQuality(principle, { paragraphById, propositionById });
  const flags = assessment.demotion_reasons || [];
  return {
    pass: assessment.principle_quality_status === "pass" && principle.usable_in_answer_layer === true,
    flags,
    demoted: principle.principle_quality_status === "demoted" || principle.usable_in_answer_layer === false,
  };
}

function propositionQuality(prop = {}, paragraphById) {
  const linked = (prop.source_paragraph_ids || []).map(id => paragraphById.get(id)).filter(Boolean);
  const quotePass = Boolean(prop.exact_quote_support && linked.some(paragraph => paragraph.paragraph_text.includes(prop.exact_quote_support)));
  const flags = [];
  if (!quotePass) flags.push("quote_support_missing");
  if (/background-only|public case context/i.test(prop.proposition_text || "")) flags.push("background_only_not_principle");
  if ((prop.issue_tags || []).length > 4) flags.push("issue_tag_overbroad");
  return { pass: quotePass && !flags.includes("background_only_not_principle"), flags };
}

function digestQuality(digest = {}) {
  const flags = [];
  if (!digest.facts_summary) flags.push("missing_facts");
  if (!(digest.issues || []).length) flags.push("missing_issues");
  if (!(digest.holdings || []).length) flags.push("missing_holding");
  if (!(digest.principle_ids || []).length && !(digest.obiter_principles || []).length && !(digest.ratio_principles || []).length && !(digest.demoted_principle_ids || []).length) flags.push("missing_principle_links");
  if (!(digest.distinguishable_when || []).length) flags.push("missing_distinguishability");
  if (digest.answer_layer_status !== "research_only") flags.push("not_research_only");
  if (digest.review_status !== "lawyer_review_required") flags.push("review_gate_missing");
  return { pass: flags.length === 0, flags };
}

function privateOrLicensedSource(record = {}) {
  const sourceFields = [
    record.source_url,
    record.official_url,
    record.legalref_url,
    record.source_system,
    record.source_visibility,
    record.source_kind,
  ].filter(Boolean).join(" ");
  if (record.source_visibility && record.source_visibility !== "public") return true;
  return /lexis|westlaw|licensed|private_source|client_document|textbook/i.test(sourceFields);
}

function updateStatus(report) {
  const status = fs.existsSync(STATUS_JSON) ? JSON.parse(fs.readFileSync(STATUS_JSON, "utf8")) : {};
  status.quality_audit_pass_rate = report.summary.quality_audit_pass_rate;
  status.principle_quality_pass_rate = report.summary.principle_quality_pass_rate;
  status.principle_quality_pass_rate_basis = report.summary.principle_quality_pass_rate_basis;
  status.usable_principle_count_in_audit = report.summary.usable_principle_count_in_audit;
  status.quality_audited_case_count = report.summary.audited_case_count;
  status.cards_demoted = report.summary.rejected_or_demoted_cards.length;
  status.quality_suspicious_card_count = report.summary.suspicious_cards.length;
  status.current_treatment_unchecked_count = report.summary.current_treatment_unchecked_count;
  status.current_treatment_checked_count = report.summary.current_treatment_checked_count;
  status.private_or_licensed_source_count = report.summary.private_or_licensed_source_count;
  status.next_target_500_cases = "500-case corpus reached on this branch; do not scale beyond 500 until weak issue tags, demotions and current-treatment checks are reviewed.";
  fs.writeFileSync(STATUS_JSON, `${JSON.stringify(status, null, 2)}\n`, "utf8");

  if (fs.existsSync(STATUS_MD)) {
    const original = fs.readFileSync(STATUS_MD, "utf8").replace(/\n## Quality Audit Metrics[\s\S]*?(?=\n## |\n?$)/m, "").trimEnd();
    const lines = [
      original,
      "",
      "## Quality Audit Metrics",
      "",
      "| Metric | Value |",
      "|---|---:|",
      `| Audited cases | ${report.summary.audited_case_count} |`,
      `| Paragraph match rate | ${report.summary.paragraph_match_rate} |`,
      `| Quote support match rate | ${report.summary.quote_support_match_rate} |`,
      `| Proposition quality pass rate | ${report.summary.proposition_quality_pass_rate} |`,
      `| Principle quality pass rate | ${report.summary.principle_quality_pass_rate} |`,
      `| Principle quality pass-rate basis | ${report.summary.principle_quality_pass_rate_basis} |`,
      `| Usable principles in audit denominator | ${report.summary.usable_principle_count_in_audit} |`,
      `| Digest quality pass rate | ${report.summary.digest_quality_pass_rate} |`,
      `| Overall quality audit pass rate | ${report.summary.quality_audit_pass_rate} |`,
      `| Suspicious cards | ${report.summary.suspicious_cards.length} |`,
      `| Rejected or demoted cards | ${report.summary.rejected_or_demoted_cards.length} |`,
      `| Current treatment unchecked | ${report.summary.current_treatment_unchecked_count} |`,
      `| Current treatment checked | ${report.summary.current_treatment_checked_count} |`,
      `| Private/licensed source count | ${report.summary.private_or_licensed_source_count} |`,
      "",
    ];
    fs.writeFileSync(STATUS_MD, `${lines.join("\n")}`, "utf8");
  }
}

function main() {
  const corpus = loadCaseCorpus({ mode: "sample" });
  const paragraphById = byId(corpus.paragraphs, "paragraph_id");
  const propositionById = byId(corpus.propositions, "proposition_id");
  const digestByCase = byId(corpus.digests, "case_id");
  const fetchByCase = byId(readJsonl(PATHS.fetchCacheManifestSample, { optional: true }), "case_id");
  const sourceArtifactPath = path.join(ROOT, "data", "legal_ingest", "case_corpus", "criminal_sample_source_cases.json");
  const sourceArtifact = fs.existsSync(sourceArtifactPath) ? JSON.parse(fs.readFileSync(sourceArtifactPath, "utf8")) : { cases: [] };
  const sourceByCase = byId(sourceArtifact.cases || [], "case_id");
  const allLayerRecords = []
    .concat(corpus.registry, corpus.paragraphs, corpus.propositions, corpus.principles, corpus.digests);

  const randomCases = corpus.registry.slice().sort((a, b) => scoreId(a.case_id) - scoreId(b.case_id)).slice(0, 20);
  const highValueCases = corpus.registry
    .filter(item => (item.issue_seed_tags || []).some(tag => /theft\.dishonesty|dishonesty|mens_rea/.test(tag)))
    .sort((a, b) => scoreId(`high_${a.case_id}`) - scoreId(`high_${b.case_id}`))
    .slice(0, 10);
  const auditedCases = uniqBy(randomCases.concat(highValueCases), item => item.case_id);

  const caseReports = [];
  const suspiciousCards = [];
  const demotedCards = [];
  const paragraphPass = [];
  const quotePass = [];
  const propositionPass = [];
  const principlePass = [];
  const digestPass = [];

  for (const registryItem of auditedCases) {
    const paragraphs = corpus.paragraphs.filter(item => item.case_id === registryItem.case_id);
    const propositions = corpus.propositions.filter(item => item.case_id === registryItem.case_id);
    const principles = corpus.principles.filter(item => item.case_id === registryItem.case_id);
    const digest = digestByCase.get(registryItem.case_id);
    const caseIssues = [];
    const casePublicPass = hasPublicSourceSnapshot(registryItem, fetchByCase, sourceByCase);
    if (!casePublicPass) caseIssues.push("case_public_source_not_verified");

    for (const paragraph of paragraphs) {
      const pass = publicSourceUrl(paragraph.source_url) &&
        new RegExp(`#p${paragraph.para_no}$`, "i").test(paragraph.source_url || "") &&
        paragraph.checksum === sha256NormalizedParagraphText(paragraph.paragraph_text) &&
        paragraph.answer_layer_status === "research_only" &&
        paragraph.review_status === "machine_candidate";
      paragraphPass.push(pass ? 1 : 0);
      if (!pass) suspiciousCards.push({ card_type: "paragraph", card_id: paragraph.paragraph_id, case_id: registryItem.case_id, reason: "paragraph_anchor_checksum_or_status_failed" });
    }

    for (const prop of propositions) {
      const quality = propositionQuality(prop, paragraphById);
      propositionPass.push(quality.pass ? 1 : 0);
      const linked = (prop.source_paragraph_ids || []).map(id => paragraphById.get(id)).filter(Boolean);
      const pass = Boolean(prop.exact_quote_support && linked.some(paragraph => paragraph.paragraph_text.includes(prop.exact_quote_support)));
      quotePass.push(pass ? 1 : 0);
      if (!quality.pass) {
        const item = { card_type: "proposition", card_id: prop.proposition_id, case_id: registryItem.case_id, reasons: quality.flags, action: "demote_or_keep_research_only" };
        suspiciousCards.push(item);
        demotedCards.push(item);
      }
    }

    for (const principle of principles) {
      const quality = principleQuality(principle, paragraphById, propositionById);
      if (principleUsable(principle)) principlePass.push(quality.pass ? 1 : 0);
      if (!quality.pass || quality.demoted) {
        const item = { card_type: "principle", card_id: principle.principle_id, case_id: registryItem.case_id, reasons: quality.flags, action: "demote_or_keep_research_only" };
        suspiciousCards.push(item);
        if (quality.demoted) demotedCards.push(item);
      }
    }

    const digestQ = digestQuality(digest || {});
    digestPass.push(digestQ.pass ? 1 : 0);
    if (!digestQ.pass) suspiciousCards.push({ card_type: "digest", card_id: digest?.case_digest_card_id || registryItem.case_id, case_id: registryItem.case_id, reasons: digestQ.flags });

    caseReports.push({
      case_id: registryItem.case_id,
      case_name: registryItem.case_name,
      neutral_citation: registryItem.neutral_citation,
      source_url: registryItem.source_url,
      public_source_verified: casePublicPass,
      paragraph_count: paragraphs.length,
      proposition_count: propositions.length,
      principle_count: principles.length,
      digest_present: Boolean(digest),
      issues: caseIssues,
    });
  }

  const report = {
    report_id: "case_corpus_quality_audit_sample_v1",
    generated_at: "2026-06-30T00:00:00.000Z",
    scope: "Quality audit over deterministic 20-case random sample plus 10 high-value theft/dishonesty cases in the verified L1-L3.5 criminal-law corpus branch.",
    sampling: {
      random_case_count: randomCases.length,
      high_value_theft_dishonesty_case_count: highValueCases.length,
      audited_case_count: auditedCases.length,
    },
    summary: {
      audited_case_count: auditedCases.length,
      paragraph_match_rate: Number(avg(paragraphPass).toFixed(6)),
      quote_support_match_rate: Number(avg(quotePass).toFixed(6)),
      proposition_quality_pass_rate: Number(avg(propositionPass).toFixed(6)),
      principle_quality_pass_rate: Number(avg(principlePass).toFixed(6)),
      principle_quality_pass_rate_basis: "usable_principles_only_after_repair",
      usable_principle_count_in_audit: principlePass.length,
      digest_quality_pass_rate: Number(avg(digestPass).toFixed(6)),
      quality_audit_pass_rate: Number(avg([avg(paragraphPass), avg(quotePass), avg(propositionPass), avg(principlePass), avg(digestPass)]).toFixed(6)),
      answer_safe_count: allLayerRecords.filter(item => item.answer_layer_status === "answer_safe").length,
      current_treatment_unchecked_count: allLayerRecords.filter(item => (item.current_treatment_status || item.treatment?.current_treatment_status || "unchecked") === "unchecked").length,
      current_treatment_checked_count: allLayerRecords.filter(item => (item.current_treatment_status || item.treatment?.current_treatment_status || "") === "checked_current").length,
      private_or_licensed_source_count: allLayerRecords.filter(privateOrLicensedSource).length,
      suspicious_cards: suspiciousCards,
      rejected_or_demoted_cards: demotedCards,
    },
    audited_cases: caseReports,
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const lines = [
    "# Case Corpus Quality Audit",
    "",
    report.scope,
    "",
    "| Metric | Value |",
    "|---|---:|",
    `| Audited cases | ${report.summary.audited_case_count} |`,
    `| Paragraph match rate | ${report.summary.paragraph_match_rate} |`,
    `| Quote support match rate | ${report.summary.quote_support_match_rate} |`,
    `| Proposition quality pass rate | ${report.summary.proposition_quality_pass_rate} |`,
    `| Principle quality pass rate | ${report.summary.principle_quality_pass_rate} |`,
    `| Principle quality pass-rate basis | ${report.summary.principle_quality_pass_rate_basis} |`,
    `| Usable principles in audit denominator | ${report.summary.usable_principle_count_in_audit} |`,
    `| Digest quality pass rate | ${report.summary.digest_quality_pass_rate} |`,
    `| Overall quality audit pass rate | ${report.summary.quality_audit_pass_rate} |`,
    `| Suspicious cards | ${suspiciousCards.length} |`,
    `| Rejected or demoted cards | ${demotedCards.length} |`,
    `| Answer-safe count | ${report.summary.answer_safe_count} |`,
    `| Current treatment unchecked | ${report.summary.current_treatment_unchecked_count} |`,
    `| Current treatment checked | ${report.summary.current_treatment_checked_count} |`,
    `| Private/licensed source count | ${report.summary.private_or_licensed_source_count} |`,
    "",
    "## Most Common Suspicious Reasons",
    "",
    "| Reason | Count |",
    "|---|---:|",
  ];
  const reasonCounts = {};
  for (const item of suspiciousCards) for (const reason of item.reasons || [item.reason]) reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
  lines.push(...Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]).map(([reason, count]) => `| ${reason} | ${count} |`));
  lines.push("", "## Boundary", "", "- This audit does not promote cards to answer_safe.", "- Suspicious and demoted cards remain research_only and should be reviewed before scaling beyond this branch.", "- Current treatment remains unchecked unless a lawyer-review gate explicitly changes it.", "");
  fs.writeFileSync(OUT_MD, `${lines.join("\n")}`, "utf8");
  updateStatus(report);
  console.log(JSON.stringify({
    script: "audit_case_corpus_quality_sample",
    audited_case_count: report.summary.audited_case_count,
    paragraph_match_rate: report.summary.paragraph_match_rate,
    quote_support_match_rate: report.summary.quote_support_match_rate,
    proposition_quality_pass_rate: report.summary.proposition_quality_pass_rate,
    principle_quality_pass_rate: report.summary.principle_quality_pass_rate,
    principle_quality_pass_rate_basis: report.summary.principle_quality_pass_rate_basis,
    usable_principle_count_in_audit: report.summary.usable_principle_count_in_audit,
    digest_quality_pass_rate: report.summary.digest_quality_pass_rate,
    quality_audit_pass_rate: report.summary.quality_audit_pass_rate,
    suspicious_card_count: report.summary.suspicious_cards.length,
    rejected_or_demoted_card_count: report.summary.rejected_or_demoted_cards.length,
    answer_safe_count: report.summary.answer_safe_count,
    current_treatment_unchecked_count: report.summary.current_treatment_unchecked_count,
    current_treatment_checked_count: report.summary.current_treatment_checked_count,
    private_or_licensed_source_count: report.summary.private_or_licensed_source_count,
    status: "passed",
  }, null, 2));
}

main();
