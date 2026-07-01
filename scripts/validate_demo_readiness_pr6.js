#!/usr/bin/env node
/* Validate that PR #6 is ready to freeze as a 120-case research-only demo. */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const errors = [];

const TARGET_MINIMUMS = {
  "criminal_law.theft.belonging_to_another": 10,
  "criminal_law.theft.intention_permanently_deprive": 10,
  "criminal_procedure.bail": 15,
};

const SAFE_DEMO_CLAIM = "The system demonstrates a source-linked HK criminal-law case-law research prototype over a targeted 120-case L1-L3.5 sample. It retrieves public case authorities with paragraph anchors, exact quotes, extracted propositions/principles, issue mapping, demotion filtering, and answer-first research memos. It is not professional legal advice; professional certification is a later HITL product step.";

function fail(message) {
  errors.push(message);
}

function readText(relativePath) {
  const filePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(filePath)) {
    fail(`missing ${relativePath}`);
    return "";
  }
  return fs.readFileSync(filePath, "utf8");
}

function readJson(relativePath) {
  const text = readText(relativePath);
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (error) {
    fail(`${relativePath} is invalid JSON: ${error.message}`);
    return {};
  }
}

function readJsonl(relativePath) {
  const text = readText(relativePath).trim();
  if (!text) return [];
  return text.split(/\n+/).filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      fail(`${relativePath}:${index + 1} is invalid JSONL: ${error.message}`);
      return null;
    }
  }).filter(Boolean);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) fail(`${label}: expected ${expected}, got ${actual}`);
}

function coverageMap(report) {
  const map = new Map();
  for (const item of report.coverage || []) map.set(item.issue_id, item);
  return map;
}

function validateFreezeReport({ status, coverage, retrieval }) {
  const report = readJson("artifacts/demo_freeze_report.json");
  const md = readText("artifacts/demo_freeze_report.md");
  if (!report.report_id) return;

  assertEqual(report.pr?.number, 6, "demo freeze PR number");
  assertEqual(report.pr?.branch, "pr6-production-release", "demo freeze branch");
  assertEqual(report.safe_demo_claim, SAFE_DEMO_CLAIM, "safe demo claim");

  for (const forbidden of [
    "10k answer-safe propositions",
    "whole HK legal RAG solved",
    "production legal advice",
    "professionally certified current treatment",
    "automated OCR/PDF/image/audio/video evidence analysis",
  ]) {
    if (!(report.forbidden_claims || []).includes(forbidden)) fail(`demo freeze report missing forbidden claim: ${forbidden}`);
    if (!md.includes(forbidden)) fail(`demo freeze markdown missing forbidden claim: ${forbidden}`);
  }

  const expectedCounts = {
    registry_case_count: status.registry_case_count,
    paragraph_card_count: status.paragraph_card_count,
    proposition_card_count: status.proposition_card_count,
    principle_card_count: status.principle_card_count,
    case_digest_card_count: status.case_digest_card_count,
    usable_principle_count: status.usable_principle_count,
    demoted_principle_count: status.demoted_principle_count,
  };
  for (const [key, value] of Object.entries(expectedCounts)) {
    assertEqual(report.corpus_counts?.[key], value, `demo freeze corpus count ${key}`);
  }

  assertEqual(report.answer_safe_count, status.answer_safe_count, "demo freeze answer_safe_count");
  assertEqual(report.retrieval_metrics?.precision_at_5, retrieval.metrics?.precision_at_5, "demo freeze precision_at_5");
  assertEqual(report.retrieval_metrics?.recall_at_10, retrieval.metrics?.recall_at_10, "demo freeze recall_at_10");
  assertEqual(report.source_proof_metrics?.source_proof_rate, retrieval.metrics?.source_proof_rate, "demo freeze source_proof_rate");
  assertEqual(report.source_proof_metrics?.wrong_domain_leak_rate, retrieval.metrics?.wrong_domain_leak_rate, "demo freeze wrong_domain_leak_rate");
  assertEqual(report.unsupported_query_abstention, retrieval.metrics?.unsupported_query_abstention_rate, "demo freeze unsupported abstention");
  assertEqual(report.public_demo?.production_target_url, "https://hk-criminal-procedure-graphrag.vercel.app/viewer/", "demo freeze production target URL");
  if (!String(report.public_demo?.current_pr_preview_url_source || "").includes("Vercel Preview URL")) {
    fail("demo freeze report missing current preview URL source note");
  }
  if (!String(report.public_demo?.native_verified_case_demo || "").includes("Verified Case Demo")) {
    fail("demo freeze report missing native Verified Case Demo workspace section");
  }
  if (!String(report.public_demo?.workspace_route || "").includes("/viewer/")) {
    fail("demo freeze report missing polished workspace route");
  }
  if (!String(report.public_demo?.legacy_warning || "").includes("seed-map research UI")) {
    fail("demo freeze report missing seed-map research UI warning");
  }
  if (!md.includes("Polished workspace route") || !md.includes("Native Verified Case Demo")) {
    fail("demo freeze markdown missing workspace/native-demo split");
  }
  if (!md.includes("Graph/domain views are seed-map research UI")) {
    fail("demo freeze markdown missing seed-map research UI boundary");
  }

  const reportCoverage = coverageMap({ coverage: report.issue_coverage || [] });
  for (const current of coverage.coverage || []) {
    const frozen = reportCoverage.get(current.issue_id);
    if (!frozen) {
      fail(`demo freeze report missing issue coverage for ${current.issue_id}`);
      continue;
    }
    assertEqual(frozen.case_count, current.case_count, `demo freeze issue count ${current.issue_id}`);
    assertEqual(frozen.coverage_band, current.coverage_band, `demo freeze issue band ${current.issue_id}`);
  }
}

function validateQueryPack() {
  const pack = readJson("artifacts/demo_outputs/demo_query_pack.json");
  const md = readText("artifacts/demo_outputs/demo_query_pack.md");
  if (!pack.pack_id) return;
  assertEqual(pack.pr_number, 6, "demo query pack PR number");
  assertEqual(pack.branch, "pr6-production-release", "demo query pack branch");
  assertEqual(pack.safe_demo_claim, SAFE_DEMO_CLAIM, "demo query pack safe claim");

  const expected = new Map([
    ["A", ["criminal_law.theft.dishonesty", false]],
    ["B", ["criminal_law.theft.intention_permanently_deprive", false]],
    ["C", ["criminal_law.theft.belonging_to_another", false]],
    ["D", ["criminal_procedure.bail", false]],
    ["E", ["", true]],
  ]);
  const seen = new Set();
  for (const query of pack.queries || []) {
    seen.add(query.id);
    const [issueId, shouldAbstain] = expected.get(query.id) || [];
    if (issueId === undefined) fail(`unexpected demo query id ${query.id}`);
    else {
      assertEqual(query.expected_issue_id, issueId, `demo query ${query.id} issue id`);
      assertEqual(query.should_abstain, shouldAbstain, `demo query ${query.id} abstention`);
      assertEqual(query.expected_answer_mode, "research_prototype", `demo query ${query.id} answer mode`);
      assertEqual(query.expected_lawyer_review_status, "unreviewed", `demo query ${query.id} quiet review metadata`);
      assertEqual(query.expected_professional_advice_certified, false, `demo query ${query.id} professional certification`);
    }
    if (!md.includes(query.query)) fail(`demo query pack markdown missing query ${query.id}`);
  }
  for (const id of expected.keys()) {
    if (!seen.has(id)) fail(`demo query pack missing query ${id}`);
  }
}

function validateReadinessMetrics({ status, coverage, retrieval }) {
  if (status.answer_safe_count > 0) fail(`answer_safe_count must be 0, got ${status.answer_safe_count}`);
  if (!Number.isFinite(status.usable_principle_count) || status.usable_principle_count <= 0) fail("usable principles count is missing or zero");
  if (!Number.isFinite(status.demoted_principle_count) || status.demoted_principle_count <= 0) fail("demoted principles count is missing or zero");

  const currentCoverage = coverageMap(coverage);
  for (const [issueId, min] of Object.entries(TARGET_MINIMUMS)) {
    const count = currentCoverage.get(issueId)?.case_count || 0;
    if (count < min) fail(`${issueId} below demo-freeze target: ${count} < ${min}`);
  }

  if ((coverage.weak_issue_tags || []).some(issueId => TARGET_MINIMUMS[issueId])) {
    fail(`target weak issue remains weak: ${(coverage.weak_issue_tags || []).join(", ")}`);
  }

  if (retrieval.metrics?.source_proof_rate < 1) fail(`source_proof_rate below 1: ${retrieval.metrics?.source_proof_rate}`);
  if (retrieval.metrics?.wrong_domain_leak_rate > 0) fail(`wrong_domain_leak_rate above 0: ${retrieval.metrics?.wrong_domain_leak_rate}`);
  if (retrieval.metrics?.unsupported_query_abstention_rate < 1) fail(`unsupported_query_abstention_rate below 1: ${retrieval.metrics?.unsupported_query_abstention_rate}`);
}

function validateDemotedPrincipleFiltering() {
  const principles = readJsonl("data/legal_ingest/case_corpus/principle_cards_sample_100.jsonl");
  const chunks = readJsonl("data/legal_ingest/case_corpus/chunks_sample_100.jsonl");
  const byId = new Map(principles.map(item => [item.principle_id, item]));

  for (const principle of principles) {
    if (principle.principle_quality_status === "demoted" && principle.usable_in_answer_layer === true) {
      fail(`demoted principle marked usable: ${principle.principle_id}`);
    }
    if (principle.usable_in_answer_layer === true && principle.principle_quality_status !== "pass") {
      fail(`usable principle is not pass: ${principle.principle_id}`);
    }
  }

  for (const chunk of chunks) {
    for (const principleId of chunk.principle_ids || []) {
      const principle = byId.get(principleId);
      if (!principle) {
        fail(`chunk references missing principle ${principleId}: ${chunk.chunk_id}`);
        continue;
      }
      if (principle.principle_quality_status !== "pass" || principle.usable_in_answer_layer !== true) {
        fail(`demoted/non-usable principle included in answer-layer chunk ${chunk.chunk_id}: ${principleId}`);
      }
    }
  }
}

function validateDemoOutputsFresh({ status }) {
  const requiredOutputs = [
    "artifacts/demo_outputs/theft_dishonesty_research_memo.md",
    "artifacts/demo_outputs/forgot_to_pay_with_evidence_text.md",
    "artifacts/demo_outputs/intention_permanently_deprive_research_memo.md",
    "artifacts/demo_outputs/belonging_to_another_research_memo.md",
    "artifacts/demo_outputs/bail_research_memo.md",
    "artifacts/demo_outputs/unsupported_landlord_query.md",
    "artifacts/demo_outputs/theft_case_corpus_l35_answer.json",
  ];
  for (const relativePath of requiredOutputs) readText(relativePath);

  const theftPayload = readJson("artifacts/demo_outputs/theft_case_corpus_l35_answer.json");
  assertEqual(theftPayload.audit_trail?.case_corpus_audit?.registry_case_count, status.registry_case_count, "demo output registry count");
  assertEqual(theftPayload.audit_trail?.case_corpus_audit?.paragraph_card_count, status.paragraph_card_count, "demo output paragraph count");
  assertEqual(theftPayload.audit_trail?.case_corpus_audit?.principle_card_count, status.principle_card_count, "demo output principle count");
  assertEqual(theftPayload.product_mode?.answer_mode, "research_prototype", "demo output answer mode");
  assertEqual(theftPayload.product_mode?.lawyer_review_status, "unreviewed", "demo output quiet review metadata");
  assertEqual(theftPayload.product_mode?.professional_advice_certified, false, "demo output professional certification");

  const unsupported = readText("artifacts/demo_outputs/unsupported_landlord_query.md");
  if (!unsupported.includes("unsupported_general_query")) fail("unsupported landlord demo no longer abstains");
  if (/Source URL: https:\/\/www\.hklii\.hk\/en\/cases\//.test(unsupported)) fail("unsupported landlord demo cites case-corpus authority");
  const bail = readText("artifacts/demo_outputs/bail_research_memo.md");
  if (!bail.includes("criminal_procedure.bail")) fail("bail demo missing issue mapping");
  if (!bail.includes("Professional advice certified: `false`")) fail("bail demo must show professional certification boundary");
  if ((bail.match(/Source URL: https:\/\/www\.hklii\.hk\/en\/cases\/[^#\s]+#p\d+/g) || []).length < 5) {
    fail("bail demo should show at least five paragraph URLs");
  }
}

const status = readJson("artifacts/case_corpus_l1_l35_status.json");
const coverage = readJson("artifacts/case_corpus_issue_coverage.json");
const retrieval = readJson("artifacts/case_corpus_retrieval_eval.json");

validateReadinessMetrics({ status, coverage, retrieval });
validateDemotedPrincipleFiltering();
validateFreezeReport({ status, coverage, retrieval });
validateQueryPack();
validateDemoOutputsFresh({ status });

if (errors.length) {
  console.error("PR #6 demo readiness validation failed:");
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log("PR #6 demo readiness validation passed.");
