#!/usr/bin/env node
/* eslint-disable no-console */

const { buildCaseGraphEvidencePack } = require("../src/case_graph/build_case_graph_evidence_pack");
const { generateSourceGatedAnswer } = require("../src/legal_answer/generate_source_gated_answer");

const query = process.argv.slice(2).join(" ") || "confession admissibility voir dire";

(async () => {
  const pack = await buildCaseGraphEvidencePack({ query, topK: 5 });
  const answer = generateSourceGatedAnswer(pack);
  console.log(JSON.stringify({
    query,
    retrieval_mode: pack.retrieval_trace.retrieval_mode,
    warnings: pack.warnings,
    answer,
  }, null, 2));
})().catch(error => {
  console.error(error.message);
  process.exit(1);
});
