#!/usr/bin/env node
/* eslint-disable no-console */

const { buildEvidencePack } = require("../src/legal_answer/build_evidence_pack");
const { generateSourceGatedAnswer } = require("../src/legal_answer/generate_source_gated_answer");
const { generateWithLlmIfEnabled } = require("../src/legal_answer/llm_adapter");
const { verifyLegalAnswer } = require("../src/legal_answer/verify_legal_answer");

const COMMAND_ID = "query_legal_assistant";

function parseArgs(argv) {
  const positional = [];
  const args = { json: false, topK: 5 };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") args.json = true;
    else if (arg === "--top-k") args.topK = Number(argv[++i] || 5);
    else positional.push(arg);
  }
  args.query = positional.join(" ").trim() || "What is the rule on inconsistent pleadings?";
  return args;
}

function printHuman(answer) {
  console.log(`${COMMAND_ID}\n`);
  console.log(`Answer Summary:\n${answer.answer_summary}\n`);
  console.log("Legal Claims:");
  for (const claim of answer.legal_claims || []) {
    const cites = (claim.supporting_citations || []).map(citation =>
      [citation.title, citation.neutral_citation, citation.paragraph || citation.page || citation.section].filter(Boolean).join(" ")
    ).join("; ");
    console.log(`- [${claim.confidence}] ${claim.claim_text}`);
    console.log(`  Source: ${cites}`);
    console.log(`  Basis: ${claim.basis}`);
  }
  console.log("\nSources Used:");
  for (const source of answer.sources_used || []) {
    console.log(`- ${source.source_id} | ${source.source_kind} | ${source.title} | ${source.neutral_citation || source.cap || ""} ${source.paragraph || source.section || ""}`);
  }
  console.log("\nRetrieval Trace:");
  console.log(JSON.stringify(answer.retrieval_trace, null, 2));
  if ((answer.warnings || []).length) {
    console.log("\nWarnings:");
    answer.warnings.forEach(item => console.log(`- ${item}`));
  }
  if ((answer.cannot_verify || []).length) {
    console.log("\nCannot Verify:");
    answer.cannot_verify.forEach(item => console.log(`- ${item}`));
  }
  if (answer.verification) {
    console.log("\nVerification:");
    console.log(JSON.stringify(answer.verification, null, 2));
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const evidencePack = await buildEvidencePack({ query: args.query, topK: args.topK });
  const llm = await generateWithLlmIfEnabled({ evidencePack });
  const answer = generateSourceGatedAnswer(evidencePack);
  answer.llm_adapter = {
    provider: llm.provider,
    status: llm.status,
  };
  answer.verification = verifyLegalAnswer(answer, evidencePack, { publicDemoMode: true });
  if (args.json) {
    console.log(JSON.stringify({ evidence_pack: evidencePack, answer }, null, 2));
  } else {
    printHuman(answer);
  }
  if (answer.verification.status !== "passed") process.exit(1);
}

main().catch(error => {
  console.error(error.message);
  if (error.payload) console.error(JSON.stringify(error.payload, null, 2));
  process.exit(1);
});
