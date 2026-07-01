#!/usr/bin/env node
/* Validate law-tree case fruit packs enforce public paragraph proof. */

const fs = require("fs");
const path = require("path");
const { LAW_TREE_CONFIGS } = require("../src/case_graph/law_tree_case_fruit_config");
const { hasVerifiedPublicParagraphAuthority, principleSummaryForAuthority } = require("../src/case_graph/verified_case_authority");

const ROOT = path.resolve(__dirname, "..");
const PACK_PATH = path.join(ROOT, "data", "legal_ingest", "case_corpus", "law_tree_case_fruit_packs.json");
const CHUNKS_PATH = path.join(ROOT, "data", "legal_ingest", "case_corpus", "law_tree_case_fruit_chunks.jsonl");
const errors = [];
const VISIBLE_BLOCKER_LABEL_RE = /verification pending|source check pending|human review required|not answer-safe|not answer safe|needs lawyer review|case audit required/i;
const LEADING_CASE_CLUSTER_EXCEPTIONS = new Set(["criminal_public_order.assembly_proportionality"]);

function fail(message) {
  errors.push(message);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

const pack = readJson(PACK_PATH);
const chunks = fs.readFileSync(CHUNKS_PATH, "utf8").trim().split(/\n+/).filter(Boolean).map(JSON.parse);
const expectedTrees = new Set(LAW_TREE_CONFIGS.map(tree => tree.tree_id));
const actualTrees = new Set((pack.trees || []).map(tree => tree.tree_id));

for (const treeId of expectedTrees) {
  if (!actualTrees.has(treeId)) fail(`missing tree pack ${treeId}`);
}

for (const tree of pack.trees || []) {
  if (!expectedTrees.has(tree.tree_id)) fail(`unexpected tree pack ${tree.tree_id}`);
  if (!tree.verified_authorities?.length) fail(`${tree.tree_id}: no verified authorities`);
  if ((tree.verified_authorities || []).length > 15) fail(`${tree.tree_id}: more than 15 authorities exported`);
  if ((tree.verified_authorities || []).length < 5) {
    fail(`${tree.tree_id}: fewer than 5 paragraph-linked authorities`);
  }
  if (!tree.viewer_node_ids?.length || !tree.doctrine_node_ids?.length) fail(`${tree.tree_id}: missing viewer/doctrine mapping`);
  const caseCounts = new Map();
  const paragraphKeys = new Set();
  for (const [index, authority] of (tree.verified_authorities || []).entries()) {
    const label = `${tree.tree_id}[${index}] ${authority.case_name || authority.source_url}`;
    if (!hasVerifiedPublicParagraphAuthority(authority)) fail(`${label}: fails public paragraph proof gate`);
    if (!authority.checksum) fail(`${label}: missing source checksum`);
    if (!principleSummaryForAuthority(authority)) fail(`${label}: missing principle/sub-issue summary`);
    if (VISIBLE_BLOCKER_LABEL_RE.test(authority.principle_text || "")) fail(`${label}: visible principle summary contains old blocker label`);
    if (VISIBLE_BLOCKER_LABEL_RE.test(authority.application_note || "")) fail(`${label}: visible application note contains old blocker label`);
    if (!authority.application_note) fail(`${label}: missing application note`);
    if (authority.answer_safe === true) fail(`${label}: answer_safe must not be true`);
    if (authority.answer_mode !== "research_prototype") fail(`${label}: answer_mode must be research_prototype`);
    if (authority.professional_advice_certified !== false) fail(`${label}: professional_advice_certified must be false`);
    const caseKey = [authority.case_id || "", authority.case_name || "", authority.neutral_citation || authority.citation || ""].join("|").toLowerCase();
    caseCounts.set(caseKey, (caseCounts.get(caseKey) || 0) + 1);
    const paragraphKey = [caseKey, authority.para_no || authority.paragraph_number || "", authority.source_url || "", authority.exact_quote || authority.supporting_quote || ""].join("|");
    if (paragraphKeys.has(paragraphKey)) fail(`${label}: duplicate-looking paragraph card`);
    paragraphKeys.add(paragraphKey);
  }
  const distinctCases = caseCounts.size;
  const topCaseShare = (tree.verified_authorities || []).length
    ? Math.max(...caseCounts.values()) / (tree.verified_authorities || []).length
    : 0;
  const hasException = LEADING_CASE_CLUSTER_EXCEPTIONS.has(tree.tree_id);
  if (distinctCases < 5 && !hasException) fail(`${tree.tree_id}: fewer than 5 distinct cases (${distinctCases}) without leading-case cluster exception`);
  if (topCaseShare > 0.4 && !hasException) fail(`${tree.tree_id}: one case exceeds 40% of visible cards (${topCaseShare.toFixed(3)}) without grouping/exception`);
  for (const seed of tree.excluded_candidates || []) {
    if (!seed.reason_excluded) fail(`${tree.tree_id}: excluded candidate missing reason`);
  }
}

for (const chunk of chunks) {
  if (!chunk.law_tree_id || !actualTrees.has(chunk.law_tree_id)) fail(`${chunk.chunk_id}: chunk references unknown tree`);
  if (!/#p\d+/i.test(chunk.source_url || "")) fail(`${chunk.chunk_id}: chunk missing paragraph source URL`);
  if (!chunk.text || !/Exact quote:/.test(chunk.text) || !/Principle:/.test(chunk.text)) fail(`${chunk.chunk_id}: chunk missing quote/principle text`);
  if (chunk.answer_mode !== "research_prototype") fail(`${chunk.chunk_id}: chunk answer_mode must be research_prototype`);
}

const report = readJson(path.join(ROOT, "artifacts", "law_tree_case_fruit_pack_report.json"));
if (report.counts?.trees_processed !== expectedTrees.size) fail("report tree count mismatch");
if (report.counts?.paragraph_cards_created !== (pack.trees || []).reduce((sum, tree) => sum + tree.verified_authorities.length, 0)) {
  fail("report paragraph count mismatch");
}

if (errors.length) {
  console.error("Law-tree case fruit pack validation failed:");
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`Law-tree case fruit pack validation passed for ${actualTrees.size} trees and ${chunks.length} chunks.`);
