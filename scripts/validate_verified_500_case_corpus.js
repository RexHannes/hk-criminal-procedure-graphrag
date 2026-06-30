#!/usr/bin/env node
/* Validate the verified public 500-case criminal-law corpus branch.
 *
 * Non-network validator only. It reads committed artifacts and fails closed on
 * answer-safe promotion, private/licensed sources, broken paragraph proof, or
 * checked-current treatment without lawyer-review infrastructure.
 */

const fs = require("fs");
const path = require("path");
const {
  ROOT,
  PATHS,
  readJsonl,
  byId,
  publicSourceUrl,
  sha256NormalizedParagraphText,
} = require("../src/legal_answer/case_corpus/case_corpus_store");
const {
  paragraphVerified,
  propositionVerified,
  principleVerified,
  sourceProofIndexes,
} = require("../src/legal_answer/case_corpus/source_proof_filter");

const OUT_JSON = path.join(ROOT, "artifacts", "verified_500_case_validation_report.json");
const OUT_MD = path.join(ROOT, "artifacts", "verified_500_case_validation_report.md");
const SOURCE_PATH = path.join(ROOT, "data", "legal_ingest", "case_corpus", "criminal_sample_source_cases.json");
const DISCOVERY_REPORT = path.join(ROOT, "artifacts", "verified_500_case_discovery_report.json");
const CURRENT_DATE = "2026-06-30";

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function countBy(records = [], keyFn) {
  const counts = {};
  for (const record of records) {
    const key = keyFn(record) || "unknown";
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function isPrivateOrLicensed(record = {}) {
  const sourceFields = [
    record.source_url,
    record.official_url,
    record.legalref_url,
    record.source_system,
    record.source_visibility,
    record.source_kind,
    record.payload?.source_url,
    record.payload?.source_visibility,
    record.payload?.source_kind,
  ].filter(Boolean).join(" ");
  if (record.source_visibility && record.source_visibility !== "public") return true;
  if (record.payload?.source_visibility && record.payload.source_visibility !== "public") return true;
  return /lexis|westlaw|licensed|private_source|client_document|textbook/i.test(sourceFields);
}

function treatmentStatus(record = {}) {
  return record.current_treatment_status || record.treatment?.current_treatment_status || "unchecked";
}

function pct(numerator, denominator) {
  return denominator ? Number((numerator / denominator).toFixed(6)) : 1;
}

function main() {
  const minCases = Number(argValue("--min-cases", "500"));
  const sourceArtifact = JSON.parse(fs.readFileSync(SOURCE_PATH, "utf8"));
  const discoveryReport = fs.existsSync(DISCOVERY_REPORT)
    ? JSON.parse(fs.readFileSync(DISCOVERY_REPORT, "utf8"))
    : null;
  const registry = readJsonl(PATHS.registrySample);
  const registryFull = readJsonl(PATHS.registryFull);
  const paragraphs = readJsonl(PATHS.paragraphsSample);
  const propositions = readJsonl(PATHS.propositionsSample);
  const principles = readJsonl(PATHS.principlesSample);
  const digests = readJsonl(PATHS.digestsSample);
  const issueMap = readJsonl(PATHS.issueMapSample);
  const chunks = readJsonl(PATHS.chunksSample, { optional: true });
  const embeddedChunks = readJsonl(PATHS.embeddedChunksManifestSample, { optional: true });
  const paragraphById = byId(paragraphs, "paragraph_id");
  const propositionById = byId(propositions, "proposition_id");
  const principleById = byId(principles, "principle_id");
  const digestByCaseId = byId(digests, "case_id");
  const corpus = { registry, paragraphs, propositions, principles, digests, issueMap, chunks, embeddedChunks };
  const indexes = sourceProofIndexes(corpus);
  const errors = [];

  function assert(condition, message) {
    if (!condition) errors.push(message);
  }

  assert(sourceArtifact.actual_case_count === registry.length, "source actual_case_count must match sample registry");
  assert(sourceArtifact.actual_case_count >= minCases, `source actual_case_count below ${minCases}`);
  assert((sourceArtifact.cases || []).length === registry.length, "source cases[] length must match registry");
  if (discoveryReport) {
    assert(discoveryReport.actual_case_count === registry.length, "discovery report actual count must match registry");
    assert(discoveryReport.target_case_count >= minCases, "discovery report target_case_count below minimum");
  }
  assert(registryFull.length === registry.length, "full registry mirror must match sample registry on this branch");

  const registryIds = new Set();
  const registryUrls = new Set();
  for (const record of registry) {
    assert(record.case_id && !registryIds.has(record.case_id), `${record.case_id}: missing/duplicate case_id`);
    registryIds.add(record.case_id);
    assert(record.verification_status === "source_verified_public", `${record.case_id}: registry verification_status must be source_verified_public`);
    assert(record.source_visibility === "public", `${record.case_id}: registry source_visibility must be public`);
    assert(record.answer_layer_status === "research_only", `${record.case_id}: registry answer_layer_status must be research_only`);
    assert(treatmentStatus(record) === "unchecked", `${record.case_id}: registry current treatment must be unchecked`);
    assert(publicSourceUrl(record.source_url), `${record.case_id}: registry source_url must be approved public URL`);
    assert(!registryUrls.has(record.source_url), `${record.case_id}: duplicate source_url`);
    registryUrls.add(record.source_url);
    assert(String(record.judgment_date || "") <= CURRENT_DATE, `${record.case_id}: judgment_date is after ${CURRENT_DATE}`);
  }

  for (const sourceCase of sourceArtifact.cases || []) {
    assert(registryIds.has(sourceCase.case_id), `${sourceCase.case_id}: source case missing from registry`);
    assert(sourceCase.source_visibility === "public", `${sourceCase.case_id}: source artifact must be public`);
    assert(sourceCase.answer_layer_status === "research_only", `${sourceCase.case_id}: source artifact must be research_only`);
    assert(publicSourceUrl(sourceCase.source_url), `${sourceCase.case_id}: source artifact URL not public`);
    assert(String(sourceCase.judgment_date || "") <= CURRENT_DATE, `${sourceCase.case_id}: source artifact judgment_date is after ${CURRENT_DATE}`);
    assert((sourceCase.selected_paragraphs || []).length >= 1, `${sourceCase.case_id}: source artifact needs selected paragraph proof`);
    for (const paragraph of sourceCase.selected_paragraphs || []) {
      assert(/#p\d+$/i.test(paragraph.source_url || ""), `${sourceCase.case_id}: selected paragraph URL missing #p anchor`);
      assert(paragraph.checksum === sha256NormalizedParagraphText(paragraph.paragraph_text), `${sourceCase.case_id}: selected paragraph checksum mismatch`);
      assert(paragraph.exact_quote_support && paragraph.paragraph_text.includes(paragraph.exact_quote_support), `${sourceCase.case_id}: selected paragraph quote support mismatch`);
    }
  }

  for (const paragraph of paragraphs) {
    assert(registryIds.has(paragraph.case_id), `${paragraph.paragraph_id}: paragraph case_id missing from registry`);
    assert(paragraphVerified(paragraph), `${paragraph.paragraph_id}: paragraph proof failed`);
    assert(paragraph.verification_status === "source_verified_public", `${paragraph.paragraph_id}: paragraph verification_status must be source_verified_public`);
    assert(treatmentStatus(paragraph) === "unchecked", `${paragraph.paragraph_id}: paragraph current treatment must be unchecked`);
  }

  for (const proposition of propositions) {
    assert(registryIds.has(proposition.case_id), `${proposition.proposition_id}: proposition case_id missing from registry`);
    assert(propositionVerified(proposition, indexes), `${proposition.proposition_id}: proposition quote proof failed`);
    assert(proposition.verification_status === "quote_verified_from_paragraph_card", `${proposition.proposition_id}: proposition verification_status must be quote_verified_from_paragraph_card`);
    assert(treatmentStatus(proposition) === "unchecked", `${proposition.proposition_id}: proposition current treatment must be unchecked`);
  }

  for (const principle of principles) {
    assert(registryIds.has(principle.case_id), `${principle.principle_id}: principle case_id missing from registry`);
    assert((principle.source_proposition_ids || []).every(id => propositionById.has(id)), `${principle.principle_id}: missing source proposition`);
    assert((principle.source_paragraph_ids || []).every(id => paragraphById.has(id)), `${principle.principle_id}: missing source paragraph`);
    assert(treatmentStatus(principle) === "unchecked", `${principle.principle_id}: principle current treatment must be unchecked`);
    assert(principle.answer_layer_status === "research_only", `${principle.principle_id}: principle must be research_only`);
    if (principle.usable_in_answer_layer) {
      assert(principleVerified(principle, indexes), `${principle.principle_id}: usable principle proof failed`);
      assert(principle.principle_quality_status === "pass", `${principle.principle_id}: usable principle must have pass quality status`);
    } else {
      assert(principle.principle_quality_status === "demoted", `${principle.principle_id}: unusable principle must be demoted`);
      assert(principle.demotion_reason, `${principle.principle_id}: demoted principle missing demotion_reason`);
    }
  }

  for (const digest of digests) {
    assert(registryIds.has(digest.case_id), `${digest.case_digest_card_id}: digest case_id missing from registry`);
    assert(treatmentStatus(digest) === "unchecked", `${digest.case_digest_card_id}: digest current treatment must be unchecked`);
    assert(digest.answer_layer_status === "research_only", `${digest.case_digest_card_id}: digest must be research_only`);
    assert(digest.review_status === "lawyer_review_required", `${digest.case_digest_card_id}: digest must remain lawyer_review_required`);
    assert((digest.key_paragraphs || []).every(id => paragraphById.has(id)), `${digest.case_digest_card_id}: digest has missing paragraph proof`);
    assert((digest.proposition_ids || []).every(id => propositionById.has(id)), `${digest.case_digest_card_id}: digest has missing proposition proof`);
    assert((digest.principle_ids || []).every(id => principleById.has(id)), `${digest.case_digest_card_id}: digest has missing principle proof`);
  }

  for (const item of issueMap) {
    assert(registryIds.has(item.case_id), `${item.issue_id}/${item.case_id}: issue map case missing`);
    assert((item.paragraph_ids || []).every(id => paragraphById.has(id)), `${item.issue_id}/${item.case_id}: issue map paragraph missing`);
    assert((item.proposition_ids || []).every(id => propositionById.has(id)), `${item.issue_id}/${item.case_id}: issue map proposition missing`);
    assert((item.principle_ids || []).every(id => principleById.has(id)), `${item.issue_id}/${item.case_id}: issue map principle missing`);
  }

  for (const chunk of chunks) {
    assert(chunk.answer_layer_status === "research_only", `${chunk.chunk_id}: chunk must be research_only`);
    assert(chunk.source_kind === "case_law", `${chunk.chunk_id}: chunk source_kind must be case_law`);
    assert(chunk.domain_id === "criminal_law_hk", `${chunk.chunk_id}: chunk domain_id must be criminal_law_hk`);
    assert(treatmentStatus(chunk) === "unchecked", `${chunk.chunk_id}: chunk treatment must be unchecked`);
    assert(!chunk.source_url || publicSourceUrl(chunk.source_url), `${chunk.chunk_id}: chunk source_url not public`);
  }

  for (const embedded of embeddedChunks) {
    assert(embedded.dry_run === true && embedded.network_used === false, `${embedded.chunk_id}: embedded manifest must be dry-run/no-network`);
    assert(embedded.payload?.source_visibility === "public", `${embedded.chunk_id}: Qdrant payload source_visibility must be public`);
    assert(embedded.payload?.source_kind === "case_law", `${embedded.chunk_id}: Qdrant payload source_kind must be case_law`);
    assert(embedded.payload?.domain_id === "criminal_law_hk", `${embedded.chunk_id}: Qdrant payload domain_id must be criminal_law_hk`);
    assert(embedded.payload?.current_treatment_status === "unchecked", `${embedded.chunk_id}: Qdrant payload treatment must be unchecked`);
  }

  const allRecords = []
    .concat(sourceArtifact.cases || [], registry, paragraphs, propositions, principles, digests, chunks, embeddedChunks);
  const paragraphProofPassCount = paragraphs.filter(paragraphVerified).length;
  const quoteProofPassCount = propositions.filter(prop => propositionVerified(prop, indexes)).length;
  const usablePrinciples = principles.filter(item => item.usable_in_answer_layer === true);
  const usablePrincipleProofCount = usablePrinciples.filter(item => principleVerified(item, indexes)).length;
  const metrics = {
    source_case_count: (sourceArtifact.cases || []).length,
    registry_case_count: registry.length,
    paragraph_card_count: paragraphs.length,
    proposition_card_count: propositions.length,
    principle_card_count: principles.length,
    usable_principle_count: usablePrinciples.length,
    demoted_principle_count: principles.filter(item => item.principle_quality_status === "demoted").length,
    digest_card_count: digests.length,
    issue_map_count: issueMap.length,
    chunk_count: chunks.length,
    embedded_chunk_count: embeddedChunks.length,
    paragraph_proof_rate: pct(paragraphProofPassCount, paragraphs.length),
    quote_proof_rate: pct(quoteProofPassCount, propositions.length),
    usable_principle_proof_rate: pct(usablePrincipleProofCount, usablePrinciples.length),
    answer_safe_count: allRecords.filter(item => item.answer_layer_status === "answer_safe").length,
    current_treatment_unchecked_count: allRecords.filter(item => treatmentStatus(item) === "unchecked").length,
    current_treatment_checked_count: allRecords.filter(item => treatmentStatus(item) === "checked_current").length,
    private_or_licensed_source_count: allRecords.filter(isPrivateOrLicensed).length,
    source_visibility_counts: countBy(allRecords, item => item.source_visibility || item.payload?.source_visibility || "not_applicable"),
    answer_layer_status_counts: countBy(allRecords, item => item.answer_layer_status || item.payload?.answer_layer_status || "not_applicable"),
  };

  assert(metrics.paragraph_proof_rate === 1, "paragraph proof rate must be 1");
  assert(metrics.quote_proof_rate === 1, "quote proof rate must be 1");
  assert(metrics.usable_principle_proof_rate === 1, "usable principle proof rate must be 1");
  assert(metrics.answer_safe_count === 0, "answer_safe_count must be 0");
  assert(metrics.current_treatment_checked_count === 0, "checked_current count must be 0 without review gate");
  assert(metrics.private_or_licensed_source_count === 0, "private/licensed source count must be 0");

  const report = {
    report_id: "verified_500_case_validation_report_v1",
    generated_at: "2026-06-30T00:00:00.000Z",
    status: errors.length ? "failed" : "passed",
    min_cases: minCases,
    metrics,
    boundaries: [
      "Public HKLII/LegalRef/e-Legislation-style sources only.",
      "No answer_safe promotion.",
      "No checked_current treatment without lawyer review.",
      "No private/licensed source authority.",
      "All case-law answer authority requires paragraph and quote proof.",
    ],
    errors,
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(OUT_MD, `${[
    "# Verified 500-Case Corpus Validation",
    "",
    `Status: ${report.status}`,
    "",
    "| Metric | Value |",
    "|---|---:|",
    ...Object.entries(metrics).filter(([, value]) => typeof value !== "object").map(([key, value]) => `| ${key} | ${value} |`),
    "",
    "## Boundaries",
    "",
    ...report.boundaries.map(item => `- ${item}`),
    "",
    errors.length ? "## Errors" : "## Errors",
    "",
    ...(errors.length ? errors.slice(0, 100).map(item => `- ${item}`) : ["- None."]),
    "",
  ].join("\n")}`, "utf8");

  if (errors.length) {
    console.error("Verified 500-case corpus validation failed:");
    errors.slice(0, 100).forEach(error => console.error(`- ${error}`));
    process.exit(1);
  }

  console.log(JSON.stringify({ script: "validate_verified_500_case_corpus", metrics, status: "passed" }, null, 2));
}

main();
