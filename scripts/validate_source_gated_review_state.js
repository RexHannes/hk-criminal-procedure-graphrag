#!/usr/bin/env node
/* eslint-disable no-console */

const { buildEvidencePack } = require("../src/legal_answer/build_evidence_pack");
const { generateSourceGatedAnswer } = require("../src/legal_answer/generate_source_gated_answer");

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

(async () => {
  const errors = [];
  const pack = await buildEvidencePack({ query: "inconsistent pleadings abuse of process", topK: 3 });
  const answer = generateSourceGatedAnswer(pack);
  assert(answer.legal_claims.length > 0, "expected claims for pilot query", errors);
  for (const claim of answer.legal_claims) {
    assert(claim.review_state, `${claim.claim_id}: review_state missing`, errors);
    assert(typeof claim.answer_safe === "boolean", `${claim.claim_id}: answer_safe boolean missing`, errors);
    if (claim.review_state !== "answer_safe") {
      assert(claim.human_review_required === true, `${claim.claim_id}: non-answer-safe claims require human review`, errors);
    }
  }
  const machineAnswer = generateSourceGatedAnswer({
    query: "machine draft",
    evidence_chunks: [
      {
        excerpt_id: "machine_1",
        chunk_id: "machine_1",
        excerpt: "machine only proposition",
        authority_role: "candidate",
        review_status: "unreviewed",
        answer_layer_status: "machine_candidate",
        issue_tags: ["machine"],
        source: {
          source_id: "machine_source",
          source_kind: "proposition_card",
          title: "Machine Source",
          chunk_id: "machine_1",
          source_visibility: "public_demo",
          tenant_id: "public",
          url_or_path: "local",
        },
      },
    ],
    sources: [],
    retrieval_trace: { query: "machine draft", collection_name: "fixture", top_k: 1, returned_count: 1, scores: [1] },
  });
  assert(machineAnswer.answer_summary.includes("machine-generated research draft"), "all-machine answer must be labelled research draft", errors);
  if (errors.length) {
    console.error("Source-gated review-state validation failed:");
    errors.forEach(error => console.error(`- ${error}`));
    process.exit(1);
  }
  console.log("Source-gated answer with review-state validation passed.");
})().catch(error => {
  console.error(error.message);
  process.exit(1);
});
