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

if (/Verification pending|Source check pending|needs verify|Case audit required|Linked authority/i.test(viewerText)) {
  fail("viewer still contains old visible pending-verification authority language");
}

const seedSources = JSON.parse(read("data/legal_ingest/case_corpus/viewer_seed_case_public_sources.json"));
const leung = (seedSources.evidence || []).find(item => item.evidence_id === "seed_hksar_v_leung_kwok_hung_2005_p1");
if (!leung) {
  fail("missing Leung Kwok Hung public seed source proof");
} else {
  if (!/legalref\.judiciary\.hk|hklii\.hk/i.test(leung.source_url || "")) fail("Leung seed proof missing public HK source URL");
  if (!/#p\d+/i.test(leung.source_url || "")) fail("Leung seed proof missing paragraph anchor");
  if (!leung.exact_quote || !String(leung.paragraph_text || "").includes(leung.exact_quote)) fail("Leung seed proof quote is not found in paragraph text");
  if (leung.answer_safe !== false) fail("Leung seed proof must remain answer_safe=false");
  if (leung.lawyer_review_required !== true) fail("Leung seed proof must require lawyer review");
  if (!/does not support the old arrest\/detention legal-adviser summary/i.test(leung.seed_alignment_warning || "")) {
    fail("Leung seed proof must carry the parent-issue mismatch warning");
  }
}

const backendEvidence = viewerCaseCorpusEvidenceForNode("criminal_procedure_hk.hksar_v_leung_kwok_hung", 3);
if (!backendEvidence.length) {
  fail("backend helper does not return Leung seed proof by doctrine node id");
} else {
  const item = backendEvidence[0];
  if (!/#p\d+/i.test(item.source_url || "")) fail("backend Leung proof missing paragraph anchor");
  if (item.answer_safe !== false) fail("backend Leung proof must be answer_safe=false");
}

if (errors.length) {
  console.error("Viewer seed source proof validation failed:");
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log("Viewer seed source proof validation passed.");
