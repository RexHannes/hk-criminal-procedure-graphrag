#!/usr/bin/env node
/* Product gate: no user-facing pending-verification case authorities. */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const errors = [];

function fail(message) {
  errors.push(message);
}

function read(relativePath) {
  const filePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(filePath)) {
    fail(`missing ${relativePath}`);
    return "";
  }
  return fs.readFileSync(filePath, "utf8");
}

function readJson(relativePath) {
  const text = read(relativePath);
  return text ? JSON.parse(text) : {};
}

function assertNoBadVisibleLabels(label, text) {
  const bad = [
    /Verification pending/i,
    /Source check pending/i,
    /Human review required/i,
    /Lawyer review required/i,
    /lawyer-review-required/i,
    /answer_safe=false/i,
    /needs_lawyer_review/i,
    /Source proof not attached/i,
    /Case audit required/i,
    /needs verify/i,
    /Linked authority/i,
    /Seed reference/i,
    /No public paragraph proof/i,
    /No paragraph proof attached/i,
  ];
  for (const pattern of bad) {
    if (pattern.test(text)) fail(`${label} contains visible bad authority label: ${pattern}`);
  }
}

const productViewerFiles = [
  "viewer/index.html",
  "viewer/app.js",
  "viewer/case_corpus_demo.html",
  "viewer/case_corpus_demo.js",
  "viewer/viewer.js",
  "viewer/pi/pi.js",
];
const viewerText = productViewerFiles.map(read).join("\n");
assertNoBadVisibleLabels("viewer product files", viewerText);

if (!/function isVisibleSearchNode/.test(viewerText)) fail("viewer does not define product search visibility filter");
if (!/if \(!isVisibleSearchNode\(n\)\) return;/.test(viewerText)) fail("viewer command search does not exclude unresolved case seeds");
if (/caseSeeds\.slice\(/.test(viewerText)) fail("viewer still renders raw case seed cards in product audit view");
if (/Seed \/ graph references/.test(viewerText)) fail("viewer still exposes seed/graph references as inspector authority section");
if (!/if \(!hasViewerCaseEvidenceForNode\(n\)\) return;/.test(viewerText)) fail("viewer local inquiry fallback can still return graph-only matches without paragraph proof");
if (!/if \(hasParagraphProof\) loadCaseFruitsForNode\(n\);/.test(viewerText)) fail("viewer inspector still loads paragraph-proof panels for unproofed nodes");

const evidenceIndex = readJson("data/legal_ingest/case_corpus/viewer_evidence_index.json");
const seedSources = readJson("data/legal_ingest/case_corpus/viewer_seed_case_public_sources.json");
const excludedReport = readJson("artifacts/excluded_unverified_case_seeds_report.json");

function validateEvidenceItem(item, label) {
  if (!item.source_url || !/(hklii\.hk|legalref\.judiciary\.hk)/i.test(item.source_url)) fail(`${label}: missing HKLII/LegalRef URL`);
  if (!/#p\d+/i.test(item.source_url || "")) fail(`${label}: missing paragraph anchor`);
  if (!item.para_no && !item.paragraph_number) fail(`${label}: missing paragraph number`);
  const quote = item.exact_quote || item.supporting_quote || "";
  if (!quote) fail(`${label}: missing exact quote`);
  if (quote && item.paragraph_text && !String(item.paragraph_text).includes(quote)) fail(`${label}: exact quote not found in paragraph text`);
  if (item.answer_safe !== false) fail(`${label}: answer_safe must be false`);
  if (item.lawyer_review_status !== "unreviewed") fail(`${label}: lawyer_review_status must be quiet unreviewed metadata`);
  if (item.answer_mode !== "research_prototype") fail(`${label}: answer_mode must be research_prototype`);
  if (item.professional_advice_certified !== false) fail(`${label}: professional_advice_certified must be false`);
}

for (const [index, item] of (evidenceIndex.evidence || []).entries()) {
  validateEvidenceItem(item, `viewer_evidence_index[${index}] ${item.evidence_id || ""}`);
}
for (const [index, item] of (seedSources.evidence || []).entries()) {
  validateEvidenceItem(item, `viewer_seed_case_public_sources[${index}] ${item.evidence_id || ""}`);
}

const requiredIssueTags = [
  "criminal_law.theft.dishonesty",
  "criminal_law.theft.intention_permanently_deprive",
  "criminal_law.theft.belonging_to_another",
  "criminal_procedure.bail",
];
for (const tag of requiredIssueTags) {
  const count = (evidenceIndex.evidence || []).filter(item => item.issue_tag === tag || (item.issue_tags || []).includes(tag)).length;
  if (count < 1) fail(`viewer evidence missing required issue coverage for ${tag}`);
}

const reportCounts = excludedReport.counts || {};
if (!reportCounts.total_case_seed_nodes) fail("excluded seed report missing total_case_seed_nodes");
if (reportCounts.total_case_seed_nodes !== reportCounts.verified_seed_nodes + reportCounts.excluded_unverified_seed_nodes) {
  fail("excluded seed report counts do not add up");
}
if (!Array.isArray(excludedReport.excluded_unverified_seed_nodes) || excludedReport.excluded_unverified_seed_nodes.length !== reportCounts.excluded_unverified_seed_nodes) {
  fail("excluded seed report excluded list count mismatch");
}
for (const seed of excludedReport.excluded_unverified_seed_nodes || []) {
  if (seed.product_status !== "excluded_from_product_authority_surfaces") fail(`${seed.original_node_id}: excluded seed has wrong product status`);
  if (!seed.reason_excluded || !seed.paragraph_proof_status) fail(`${seed.original_node_id}: excluded seed lacks reason/proof status`);
}

if (errors.length) {
  console.error("No-visible-pending verification validation failed:");
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log("No-visible-pending verification validation passed.");
