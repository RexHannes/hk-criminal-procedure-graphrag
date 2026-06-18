#!/usr/bin/env node
/* eslint-disable no-console */

const { buildEvidencePack } = require("../src/legal_answer/build_evidence_pack");
const { generateSourceGatedAnswer } = require("../src/legal_answer/generate_source_gated_answer");
const { legalClaim, legalSource } = require("../src/legal_answer/schema");
const { verifyLegalAnswer } = require("../src/legal_answer/verify_legal_answer");

const QUERY = "What is the consequence of inconsistent factual pleadings across more than one case? abuse of process estoppel collateral attack";

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

async function validateNormalAnswer(errors) {
  const evidencePack = await buildEvidencePack({ query: QUERY, topK: 5 });
  const answer = generateSourceGatedAnswer(evidencePack);
  const verification = verifyLegalAnswer(answer, evidencePack, { publicDemoMode: true });
  assert(evidencePack.evidence_chunks.length > 0, "evidence pack should have hits", errors);
  assert(answer.legal_claims.length > 0, "answer should have legal claims", errors);
  assert(answer.legal_claims.every(claim => claim.supporting_citations.length > 0), "every claim should have a citation", errors);
  assert(answer.legal_claims.every(claim => claim.supporting_excerpt_ids.length > 0), "every claim should have excerpt ids", errors);
  assert(answer.sources_used.every(source => source.source_id && source.chunk_id), "every source needs source_id and chunk_id", errors);
  assert(answer.retrieval_trace.query === QUERY, "retrieval trace should include query", errors);
  assert(answer.retrieval_trace.collection_name, "retrieval trace should include collection", errors);
  assert(answer.retrieval_trace.returned_count > 0, "retrieval trace should include returned count", errors);
  assert(answer.retrieval_trace.scores.length > 0, "retrieval trace should include scores", errors);
  assert(verification.status === "passed", `verification should pass: ${verification.errors.join("; ")}`, errors);
  assert((answer.cannot_verify || []).some(item => /collateral attack/i.test(item)), "collateral attack should be cannot_verify when unsupported", errors);
}

function validateNoSourceGate(errors) {
  const evidencePack = {
    query: "What is an unsupported legal rule?",
    evidence_chunks: [],
    sources: [],
    retrieval_trace: {
      query: "What is an unsupported legal rule?",
      collection_name: "hk_proposition_cards",
      top_k: 5,
      returned_count: 0,
      scores: [],
    },
    warnings: ["no_qdrant_hits"],
  };
  const answer = generateSourceGatedAnswer(evidencePack);
  assert(answer.legal_claims.length === 0, "no-source answer should not create legal claims", errors);
  assert(answer.cannot_verify.length > 0, "no-source answer should populate cannot_verify", errors);
}

function validateInventedCitationDetector(errors) {
  const evidencePack = {
    query: "invented citation test",
    evidence_chunks: [
      {
        excerpt_id: "excerpt_1",
        source_id: "source_1",
        chunk_id: "chunk_1",
        source: legalSource({
          source_id: "source_1",
          source_kind: "proposition_card",
          title: "Known Case",
          neutral_citation: "[2020] HKCFI 2215",
          paragraph: "para 31",
          chunk_id: "chunk_1",
        }),
      },
    ],
    retrieval_trace: {
      query: "invented citation test",
      collection_name: "hk_proposition_cards",
      top_k: 1,
      returned_count: 1,
      scores: [1],
    },
  };
  const answer = {
    answer_summary: "Invented citation check",
    legal_claims: [
      legalClaim({
        claim_id: "bad_claim",
        claim_text: "This proposition is supposedly supported by [2099] HKCFI 9999.",
        claim_type: "principle",
        supporting_citations: [{
          source_id: "source_1",
          chunk_id: "chunk_1",
          source_kind: "proposition_card",
          title: "Known Case",
          neutral_citation: "[2020] HKCFI 2215",
          paragraph: "para 31",
        }],
        supporting_excerpt_ids: ["excerpt_1"],
        confidence: "medium",
      }),
    ],
    sources_used: [evidencePack.evidence_chunks[0].source],
    retrieval_trace: evidencePack.retrieval_trace,
    warnings: [],
    cannot_verify: [],
  };
  const verification = verifyLegalAnswer(answer, evidencePack);
  assert(verification.status === "failed", "invented citation should fail verification", errors);
  assert(verification.errors.some(error => error.includes("[2099] HKCFI 9999")), "invented citation error should name fake citation", errors);
}

function validatePrivateSourceGate(errors) {
  const privateSource = legalSource({
    source_id: "private_book",
    source_kind: "textbook_private",
    title: "Private Book",
    page: "p 1",
    chunk_id: "private_chunk",
  });
  const evidencePack = {
    query: "private source test",
    evidence_chunks: [{ excerpt_id: "private_chunk", source_id: "private_book", chunk_id: "private_chunk", source: privateSource }],
    retrieval_trace: { query: "private source test", collection_name: "private", top_k: 1, returned_count: 1, scores: [1] },
  };
  const answer = {
    answer_summary: "Private source test",
    legal_claims: [legalClaim({
      claim_id: "private_claim",
      claim_text: "Private source claim.",
      claim_type: "principle",
      supporting_citations: [{ source_id: "private_book", chunk_id: "private_chunk", source_kind: "textbook_private", title: "Private Book", page: "p 1" }],
      supporting_excerpt_ids: ["private_chunk"],
      confidence: "low",
    })],
    sources_used: [privateSource],
    retrieval_trace: evidencePack.retrieval_trace,
    warnings: [],
    cannot_verify: [],
  };
  const verification = verifyLegalAnswer(answer, evidencePack, { publicDemoMode: true });
  assert(verification.status === "failed", "private source should fail in public-demo mode", errors);
}

(async () => {
  const errors = [];
  await validateNormalAnswer(errors);
  validateNoSourceGate(errors);
  validateInventedCitationDetector(errors);
  validatePrivateSourceGate(errors);
  if (errors.length) {
    console.error("Source-gated answer validation failed:");
    errors.forEach(error => console.error(`- ${error}`));
    process.exit(1);
  }
  console.log("Source-gated answer smoke passed.");
  console.log("No-source/no-answer gate passed.");
  console.log("Invented citation detector passed.");
})().catch(error => {
  console.error(error);
  if (error.payload) console.error(JSON.stringify(error.payload, null, 2));
  process.exit(1);
});
