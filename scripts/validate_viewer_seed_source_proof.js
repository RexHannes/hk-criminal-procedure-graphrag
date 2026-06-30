#!/usr/bin/env node
/* Ensure legacy seed cases do not render as pending authorities and verified seed proof is backend-visible. */

const fs = require("fs");
const path = require("path");
const { viewerCaseCorpusEvidenceForNode } = require("../src/case_graph/viewer_case_corpus_evidence");

const ROOT = path.resolve(__dirname, "..");
const errors = [];

function fail(message) {
  errors.push(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

const viewerText = [
  "viewer/app.js",
  "viewer/viewer.js",
  "viewer/pi/pi.js",
].map(read).join("\n");

if (/Verification pending|Source check pending|Human review required|Lawyer review required|lawyer-review-required|answer_safe=false|needs_lawyer_review|needs verify|Case audit required|Linked authority/i.test(viewerText)) {
  fail("viewer still contains old visible pending-verification authority language");
}

const seedSources = JSON.parse(read("data/legal_ingest/case_corpus/viewer_seed_case_public_sources.json"));
const excludedReport = JSON.parse(read("artifacts/excluded_unverified_case_seeds_report.json"));
const leungProofs = (seedSources.evidence || []).filter(item => /^seed_hksar_v_leung_kwok_hung_2005_p(17|18)$/.test(item.evidence_id || ""));
if (leungProofs.length !== 2) {
  fail("missing Leung Kwok Hung public seed source proof for paras 17 and 18");
} else {
  for (const leung of leungProofs) {
    if (!/legalref\.judiciary\.hk|hklii\.hk/i.test(leung.source_url || "")) fail("Leung seed proof missing public HK source URL");
    if (!/#p(17|18)$/i.test(leung.source_url || "")) fail("Leung seed proof missing paragraph 17/18 anchor");
    if (leung.neutral_citation !== "[2005] HKCFA 2") fail("Leung seed proof must use the 2005 CFA neutral citation");
    if (!leung.exact_quote || !String(leung.paragraph_text || "").includes(leung.exact_quote)) fail("Leung seed proof quote is not found in paragraph text");
    if (leung.answer_mode !== "research_prototype") fail("Leung seed proof must be research_prototype");
    if (leung.lawyer_review_status !== "unreviewed") fail("Leung seed proof must keep quiet lawyer_review_status metadata");
    if (leung.professional_advice_certified !== false) fail("Leung seed proof must not be professionally certified");
    if (!/does not support the old arrest\/detention legal-adviser summary/i.test(leung.seed_alignment_warning || "")) {
      fail("Leung seed proof must carry the parent-issue mismatch warning");
    }
  }
}

const backendEvidence = viewerCaseCorpusEvidenceForNode("criminal_procedure_hk.hksar_v_leung_kwok_hung", 3);
if (!backendEvidence.length) {
  fail("backend helper does not return Leung seed proof by doctrine node id");
} else {
  const item = backendEvidence[0];
  if (!/#p\d+/i.test(item.source_url || "")) fail("backend Leung proof missing paragraph anchor");
  if (item.answer_mode !== "research_prototype") fail("backend Leung proof must be research_prototype");
  if (item.professional_advice_certified !== false) fail("backend Leung proof must keep professional certification false");
}

if ((excludedReport.counts?.excluded_unverified_seed_nodes || 0) < 1) {
  fail("excluded unverified seed report is empty");
}
if ((excludedReport.excluded_unverified_seed_nodes || []).some(item => item.product_status !== "excluded_from_product_authority_surfaces")) {
  fail("excluded seed report contains a seed not marked excluded_from_product_authority_surfaces");
}

if (errors.length) {
  console.error("Viewer seed source proof validation failed:");
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log("Viewer seed source proof validation passed.");
