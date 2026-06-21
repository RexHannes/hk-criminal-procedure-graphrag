#!/usr/bin/env node
/* eslint-disable no-console */

const { localCaseFruitEvidenceForNode } = require("../src/case_graph/local_case_fruit_evidence");
const { lineageRankEvidence, lineageScore } = require("../src/case_graph/case_fruit_lineage");
const { buildCaseFruitSopBridge } = require("../src/case_graph/case_fruit_sop_bridge");

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

const errors = [];
const raw = localCaseFruitEvidenceForNode("criminal_procedure_hk.nsl_bail");
const ranked = lineageRankEvidence(raw);

assert(ranked.length >= 10, "nsl_bail should have a substantial public candidate lineage set", errors);
assert(ranked[0].neutral_citation === "[2021] HKCFA 3", `top lineage item should be Lai CFA, got ${ranked[0]?.neutral_citation}`, errors);
assert(ranked[0].court_level === "CFA", `top lineage item should have CFA court level, got ${ranked[0]?.court_level}`, errors);
assert(ranked[0].lineage_score > 0, "top lineage score should be positive", errors);
assert(ranked.every(item => item.answer_layer_status === "candidate_only"), "lineage sorting must not promote answer layer", errors);
assert(ranked.every(item => item.human_review_status === "unreviewed"), "lineage sorting must not mark evidence reviewed", errors);

const cfa = ranked.find(item => item.court_level === "CFA" && item.authority_role === "ratio");
const cfiLaterConsidered = ranked.find(item => item.court_level === "CFI" && /later_considered/i.test(item.authority_status || ""));
assert(cfa && cfiLaterConsidered, "expected both CFA and later-considered CFI examples", errors);
assert(lineageScore(cfa) > lineageScore(cfiLaterConsidered), "CFA ratio should score above later-considered CFI candidate", errors);

const bridge = buildCaseFruitSopBridge({ doctrineNodeId: "criminal_procedure_hk.nsl_bail" });
const firstTrail = bridge.applied.applied_answer.sections
  .find(section => section.heading === "Case Fruit Source Trail")
  ?.items?.[0] || "";
assert(firstTrail.includes("[2021] HKCFA 3"), "SOP source trail should start with CFA lineage item", errors);
assert(bridge.response_payload.warnings.includes("case_fruits_research_only_until_reviewed"), "SOP bridge must retain research-only warning", errors);

if (errors.length) {
  console.error("Case fruit lineage sort validation failed:");
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log("Case fruit lineage sort validation passed.");
