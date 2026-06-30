#!/usr/bin/env node
/* Validate corpus status dashboard against actual L1-L3.5 sample artifacts. */

const fs = require("fs");
const path = require("path");
const {
  ROOT,
  PATHS,
  readJsonl,
  sha256NormalizedParagraphText,
} = require("../src/legal_answer/case_corpus/case_corpus_store");

const STATUS_JSON_PATH = path.join(ROOT, "artifacts", "case_corpus_l1_l35_status.json");
const STATUS_MD_PATH = path.join(ROOT, "artifacts", "case_corpus_l1_l35_status.md");

const report = JSON.parse(fs.readFileSync(STATUS_JSON_PATH, "utf8"));
const markdown = fs.readFileSync(STATUS_MD_PATH, "utf8");
const registry = readJsonl(PATHS.registrySample);
const paragraphs = readJsonl(PATHS.paragraphsSample);
const propositions = readJsonl(PATHS.propositionsSample);
const principles = readJsonl(PATHS.principlesSample);
const digests = readJsonl(PATHS.digestsSample);
const issueMap = readJsonl(PATHS.issueMapSample);
const chunks = readJsonl(PATHS.chunksSample, { optional: true });
const embeddedChunks = readJsonl(PATHS.embeddedChunksManifestSample, { optional: true });
const errors = [];
const minCasesIndex = process.argv.indexOf("--min-cases");
const minCases = Number(minCasesIndex >= 0 ? process.argv[minCasesIndex + 1] : "25");

function assert(condition, message) {
  if (!condition) errors.push(message);
}

const quotePassCount = propositions.filter(prop => {
  const text = paragraphs
    .filter(paragraph => (prop.source_paragraph_ids || []).includes(paragraph.paragraph_id))
    .map(paragraph => paragraph.paragraph_text)
    .join(" ");
  return text.includes(prop.exact_quote_support || "");
}).length;
const checksumPassCount = paragraphs.filter(paragraph => paragraph.checksum === sha256NormalizedParagraphText(paragraph.paragraph_text)).length;
const researchOnlyCount = []
  .concat(registry, paragraphs, propositions, principles, digests)
  .filter(item => item.answer_layer_status === "research_only").length;
const usablePrincipleCount = principles.filter(item => item.usable_in_answer_layer === true && item.principle_quality_status === "pass").length;
const issueCaseCounts = issueMap.reduce((acc, item) => {
  if (!acc[item.issue_id]) acc[item.issue_id] = new Set();
  acc[item.issue_id].add(item.case_id);
  return acc;
}, {});
const chunkCounts = chunks.reduce((acc, chunk) => {
  acc[chunk.chunk_type] = (acc[chunk.chunk_type] || 0) + 1;
  return acc;
}, {});

assert(report.registry_case_count === registry.length, "registry_case_count mismatch");
assert(report.registry_case_count >= minCases, `registry_case_count below minimum ${minCases}`);
assert(report.paragraphized_case_count === new Set(paragraphs.map(item => item.case_id)).size, "paragraphized_case_count mismatch");
assert(report.paragraph_card_count === paragraphs.length, "paragraph_card_count mismatch");
assert(report.proposition_card_count === propositions.length, "proposition_card_count mismatch");
assert(report.principle_card_count === principles.length, "principle_card_count mismatch");
assert(report.case_digest_card_count === digests.length, "case_digest_card_count mismatch");
assert(report.issue_mapped_case_count === new Set(issueMap.map(item => item.case_id)).size, "issue_mapped_case_count mismatch");
assert(report.paragraph_anchor_pass_rate === 1, "paragraph anchor pass rate must be 1 for sample");
assert(report.quote_support_pass_rate === quotePassCount / propositions.length, "quote support pass rate mismatch");
assert(report.checksum_pass_rate === checksumPassCount / paragraphs.length, "checksum pass rate mismatch");
assert(report.answer_safe_count === 0, "answer_safe_count must remain 0");
assert(report.research_only_count === researchOnlyCount, "research_only_count mismatch");
assert(report.layers?.L4?.includes("not implemented"), "L4 boundary missing");
assert(Array.isArray(report.top_issue_coverage) && report.top_issue_coverage.length >= 3, "top_issue_coverage missing/too small");
assert(report.top_issue_coverage.some(item => item.issue_id === "criminal_law.theft"), "top_issue_coverage missing criminal_law.theft");
assert(report.cases_by_court && Object.keys(report.cases_by_court).length >= 1, "cases_by_court missing");
assert(report.cases_by_year && Object.keys(report.cases_by_year).length >= 1, "cases_by_year missing");
assert(Array.isArray(report.extraction_limitations) && report.extraction_limitations.length >= 2, "extraction_limitations missing");
assert(report.next_scale_target?.safe_claim?.includes("not a 10k answer-safe corpus"), "next_scale_target safe claim missing");
assert(/real L1-L3\.5 public criminal-law (sample corpus|corpus branch)/i.test(report.scope_note || ""), "scope note must identify real public criminal-law corpus");
assert(/L4.*not implemented|L4\/current-treatment review is not implemented/i.test(report.scope_note || ""), "scope note missing L4 boundary");
assert(markdown.includes("L4 answer-safe review: not implemented"), "status markdown missing L4 boundary");
assert(markdown.includes("Do not describe this sample as 10k answer-safe propositions"), "status markdown missing forbidden claim");
assert(markdown.includes("Top Issue Coverage"), "status markdown missing top issue coverage");
assert(markdown.includes("Cases By Court"), "status markdown missing court table");
assert(markdown.includes("Cases By Year"), "status markdown missing year table");
assert(report.chunk_count_by_type?.case_paragraph_chunk === paragraphs.length, "paragraph chunk count mismatch");
assert(report.chunk_count_by_type?.case_proposition_chunk === propositions.length, "proposition chunk count mismatch");
assert(report.chunk_count_by_type?.case_principle_chunk === usablePrincipleCount, "usable principle chunk count mismatch");
assert(report.chunk_count_by_type?.case_digest_chunk === digests.length, "digest chunk count mismatch");
assert(report.chunk_count_by_type?.issue_cluster_chunk === chunkCounts.issue_cluster_chunk, "issue cluster chunk count mismatch");
assert(report.embedded_chunk_count === embeddedChunks.length, "embedded_chunk_count mismatch");
assert(report.dry_run_vector_count === chunks.length, "dry_run_vector_count mismatch");
assert(report.qdrant_collection_targets?.primary_chunk_collection, "qdrant collection target missing");
assert(report.retrieval_eval_precision_at_5 > 0, "retrieval precision@5 missing");
assert(report.retrieval_eval_precision_at_5 >= 0.85, "retrieval precision@5 below target");
assert(report.retrieval_eval_recall_at_10 >= 0.5, "retrieval recall@10 below target");
assert(report.retrieval_recall_improvement > 0, "retrieval_recall_improvement missing/non-positive");
assert(report.retrieval_eval_legacy_corpus_recall_at_10 >= 0, "legacy corpus recall missing");
assert(report.source_proof_rate === 1, "source_proof_rate must be 1");
assert(report.wrong_domain_leak_rate === 0, "wrong_domain_leak_rate must be 0");
assert(report.unsupported_query_abstention_rate === 1, "unsupported_query_abstention_rate must be 1");
assert(report.duplicate_rate <= 0.03, "duplicate_rate must remain low; same-name/date related judgments may be reported but hard IDs/URLs must stay unique");
assert(report.failed_ingest_count === 0, "failed_ingest_count must be 0");
assert(report.retryable_failure_count === 0, "retryable_failure_count must be 0");
assert(markdown.includes("RAG Pipeline Metrics"), "status markdown missing RAG pipeline metrics");
assert(report.candidate_extractions_total >= 40, "candidate_extractions_total missing/too low");
assert(report.candidates_verified >= 25, "candidates_verified missing/too low");
assert(report.candidates_rejected >= 1, "candidates_rejected missing/too low");
assert(report.verified_cases_added >= 25, "verified_cases_added missing/too low");
assert(report.paragraph_cards_added >= 100, "paragraph_cards_added missing/too low");
assert(report.propositions_added >= 50, "propositions_added missing/too low");
assert(report.principles_added >= 25, "principles_added missing/too low");
assert(report.digests_added >= 25, "digests_added missing/too low");
assert(report.candidate_paragraph_cards_added >= 100, "candidate_paragraph_cards_added missing/too low");
assert(report.candidate_propositions_added >= 50, "candidate_propositions_added missing/too low");
assert(report.candidate_principles_added >= 25, "candidate_principles_added missing/too low");
assert(report.candidate_digests_added >= 25, "candidate_digests_added missing/too low");
assert(report.candidate_answer_safe_count === 0, "candidate workflow cannot create answer_safe cards");
assert(report.candidate_cards_demoted >= 1, "candidate_cards_demoted missing/too low");
assert(report.cards_demoted >= 1, "cards_demoted missing/too low");
assert(report.usable_principle_count === usablePrincipleCount, "usable_principle_count mismatch");
assert(report.demoted_principle_count >= 1, "demoted_principle_count missing/too low");
assert(report.principle_quality_status_counts?.pass === usablePrincipleCount, "principle pass status count mismatch");
assert(report.fast_growth_workflow === "candidate_extractor_to_public_paragraph_verification_to_research_only_cards", "fast growth workflow marker missing");
assert(markdown.includes("Candidate Fast-Growth Metrics"), "status markdown missing candidate fast-growth metrics");
assert(markdown.includes("candidate extractors only"), "status markdown missing candidate-only boundary");
assert(report.quality_audit_pass_rate >= 0.8, "quality_audit_pass_rate missing/too low");
assert(report.quality_audit_pass_rate >= 0.95, "quality_audit_pass_rate should improve after principle repair");
assert(report.principle_quality_pass_rate >= 0.75, "principle_quality_pass_rate below target");
assert(report.quality_audited_case_count >= 20, "quality_audited_case_count missing/too low");
assert(Array.isArray(report.weak_issue_tags), "weak_issue_tags missing");
assert(!report.weak_issue_tags.includes("criminal_law.theft.belonging_to_another"), "belonging_to_another should no longer be weak");
assert(!report.weak_issue_tags.includes("criminal_law.theft.intention_permanently_deprive"), "intention_permanently_deprive should no longer be weak");
assert(!report.weak_issue_tags.includes("criminal_procedure.bail"), "bail should no longer be weak");
assert((issueCaseCounts["criminal_law.theft.belonging_to_another"]?.size || 0) >= 10, "belonging_to_another target coverage not met");
assert((issueCaseCounts["criminal_law.theft.intention_permanently_deprive"]?.size || 0) >= 10, "intention_permanently_deprive target coverage not met");
assert((issueCaseCounts["criminal_procedure.bail"]?.size || 0) >= 15, "bail target coverage not met");
assert(report.next_target_500_cases && report.next_target_500_cases.includes("500"), "next_target_500_cases missing");
assert(markdown.includes("Quality Audit Metrics"), "status markdown missing quality audit metrics");
assert(markdown.includes("Issue Coverage Audit"), "status markdown missing issue coverage audit");
assert(markdown.includes("Principle Quality Repair"), "status markdown missing principle quality repair");

if (errors.length) {
  console.error("Case corpus L1-L3.5 status validation failed:");
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log("Case corpus L1-L3.5 status validation passed.");
