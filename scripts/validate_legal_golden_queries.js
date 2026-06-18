#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");

const { buildEvidencePack } = require("../src/legal_answer/build_evidence_pack");
const { generateSourceGatedAnswer } = require("../src/legal_answer/generate_source_gated_answer");
const { verifyLegalAnswer } = require("../src/legal_answer/verify_legal_answer");

const ROOT = path.resolve(__dirname, "..");
const GOLDEN_PATH = path.join(ROOT, "data", "legal_ingest", "mvp", "golden_queries.json");

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

function evidenceIds(evidencePack) {
  const ids = new Set();
  for (const chunk of evidencePack.evidence_chunks || []) {
    [
      chunk.excerpt_id,
      chunk.chunk_id,
      chunk.source_id,
      chunk.source?.source_id,
      chunk.source?.chunk_id,
    ].filter(Boolean).forEach(value => ids.add(String(value)));
  }
  return ids;
}

function sourceKinds(answer) {
  return new Set((answer.sources_used || []).map(source => source.source_kind));
}

function answerText(answer) {
  return JSON.stringify({
    answer_summary: answer.answer_summary,
    legal_claims: answer.legal_claims,
    warnings: answer.warnings,
    cannot_verify: answer.cannot_verify,
  }).toLowerCase();
}

async function validateQuery(querySpec) {
  const errors = [];
  const evidencePack = await buildEvidencePack({ query: querySpec.query, topK: querySpec.top_k || 5 });
  const answer = generateSourceGatedAnswer(evidencePack);
  const verification = verifyLegalAnswer(answer, evidencePack, { publicDemoMode: true });
  const ids = evidenceIds(evidencePack);
  const kinds = sourceKinds(answer);
  const text = answerText(answer);

  if (querySpec.expected_behavior === "answer_with_citations") {
    assert(answer.legal_claims.length > 0, `${querySpec.id}: expected cited claims`, errors);
    assert(verification.status === "passed", `${querySpec.id}: verification failed: ${verification.errors.join("; ")}`, errors);
    for (const kind of querySpec.must_include_source_kind || []) {
      assert(kinds.has(kind), `${querySpec.id}: expected source kind ${kind}`, errors);
    }
    if ((querySpec.must_retrieve_any || []).length) {
      assert(
        querySpec.must_retrieve_any.some(id => ids.has(id)),
        `${querySpec.id}: did not retrieve any expected id (${querySpec.must_retrieve_any.join(", ")})`,
        errors
      );
    }
  } else if (querySpec.expected_behavior === "cannot_verify") {
    assert(answer.cannot_verify.length > 0, `${querySpec.id}: expected cannot_verify`, errors);
    assert(answer.legal_claims.length === 0 || verification.status === "passed", `${querySpec.id}: unsupported answer should not fail verification`, errors);
  } else {
    errors.push(`${querySpec.id}: unknown expected_behavior ${querySpec.expected_behavior}`);
  }

  for (const forbidden of querySpec.must_not_contain || []) {
    assert(!text.includes(String(forbidden).toLowerCase()), `${querySpec.id}: answer contains forbidden text ${forbidden}`, errors);
  }

  return {
    id: querySpec.id,
    passed: errors.length === 0,
    errors,
    retrieved: Array.from(ids),
    source_kinds: Array.from(kinds),
    claim_count: answer.legal_claims.length,
    cannot_verify_count: answer.cannot_verify.length,
  };
}

(async () => {
  const suite = JSON.parse(fs.readFileSync(GOLDEN_PATH, "utf8"));
  const results = [];
  for (const querySpec of suite.queries || []) {
    results.push(await validateQuery(querySpec));
  }
  const failures = results.filter(result => !result.passed);
  if (failures.length) {
    console.error("Golden query validation failed:");
    for (const failure of failures) {
      console.error(`- ${failure.id}`);
      failure.errors.forEach(error => console.error(`  - ${error}`));
    }
    process.exit(1);
  }
  console.log(`Golden query validation passed (${results.length} queries).`);
})().catch(error => {
  console.error(error.message);
  if (error.payload) console.error(JSON.stringify(error.payload, null, 2));
  process.exit(1);
});
