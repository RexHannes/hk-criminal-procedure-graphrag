#!/usr/bin/env node
/* Validate that the public viewer entry point shows the verified PR #6 source-proof demo. */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const errors = [];

const REQUIRED_FILES = [
  "viewer/index.html",
  "viewer/case_corpus_demo.html",
  "viewer/case_corpus_demo.js",
  "viewer/case_corpus_demo.css",
  "viewer/index_legacy.html",
  "artifacts/demo_freeze_report.json",
  "artifacts/demo_freeze_report.md",
  "artifacts/demo_outputs/demo_query_pack.json",
  "artifacts/demo_outputs/theft_dishonesty_research_memo.md",
  "artifacts/demo_outputs/intention_permanently_deprive_research_memo.md",
  "artifacts/demo_outputs/belonging_to_another_research_memo.md",
  "artifacts/demo_outputs/bail_research_memo.md",
  "artifacts/demo_outputs/unsupported_landlord_query.md",
];

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

function assertIncludes(text, needle, label) {
  if (!text.includes(needle)) fail(`${label} missing ${needle}`);
}

const files = new Map(REQUIRED_FILES.map(file => [file, read(file)]));
const publicDemo = [
  files.get("viewer/index.html"),
  files.get("viewer/case_corpus_demo.html"),
  files.get("viewer/case_corpus_demo.js"),
  files.get("artifacts/demo_freeze_report.json"),
  files.get("artifacts/demo_freeze_report.md"),
  files.get("artifacts/demo_outputs/demo_query_pack.json"),
  files.get("artifacts/demo_outputs/theft_dishonesty_research_memo.md"),
  files.get("artifacts/demo_outputs/intention_permanently_deprive_research_memo.md"),
  files.get("artifacts/demo_outputs/belonging_to_another_research_memo.md"),
  files.get("artifacts/demo_outputs/bail_research_memo.md"),
  files.get("artifacts/demo_outputs/unsupported_landlord_query.md"),
].join("\n");

const viewerIndex = files.get("viewer/index.html") || "";
const demoHtml = files.get("viewer/case_corpus_demo.html") || "";
const demoJs = files.get("viewer/case_corpus_demo.js") || "";
const legacy = files.get("viewer/index_legacy.html") || "";

for (const forbidden of [
  "window.DATA_INDEX",
  "window.DATA_ROOT",
  "data/legal_domain_packs/demo_maps",
  "Verification pending",
  "Casemap4",
  "app.js",
]) {
  if (viewerIndex.includes(forbidden)) fail(`/viewer/ still appears to load legacy graph workspace token: ${forbidden}`);
}

assertIncludes(viewerIndex, "PR #6 verified case-corpus demo", "/viewer/");
assertIncludes(viewerIndex, "Source-proofed HK criminal-law research demo", "/viewer/");
assertIncludes(viewerIndex, "answer_safe=false", "/viewer/");
assertIncludes(viewerIndex, "case_corpus_demo.js", "/viewer/");
assertIncludes(demoHtml, "PR #6 verified case-corpus demo", "case_corpus_demo.html");
assertIncludes(demoJs, "demo_freeze_report.json", "case_corpus_demo.js");
assertIncludes(demoJs, "demo_query_pack.json", "case_corpus_demo.js");
assertIncludes(demoJs, "bail_research_memo.md", "case_corpus_demo.js");

assertIncludes(legacy, "Legacy graph viewer - unverified seed map", "legacy viewer");
assertIncludes(legacy, "not the PR #6 verified case-corpus demo", "legacy viewer");
assertIncludes(legacy, "case_corpus_demo.html", "legacy viewer");

if (!/https?:\/\/(?:www\.)?(?:hklii\.hk|legalref\.judiciary\.hk)\//i.test(publicDemo)) {
  fail("public demo/artifacts must contain at least one HKLII/LegalRef URL");
}
if (!/#p\d+/i.test(publicDemo)) fail("public demo/artifacts must contain at least one #p paragraph anchor");
if (!/Exact quote:/i.test(publicDemo)) fail("public demo/artifacts must contain at least one Exact quote");
if (!/(answer_safe=false|Answer safe:\s*`false`|Answer safe:\s*false)/i.test(publicDemo)) {
  fail("public demo/artifacts must show answer_safe=false");
}
if (!/(lawyer-review-required|Lawyer review required|needs_lawyer_review=true|needs_lawyer_review":\s*true)/i.test(publicDemo)) {
  fail("public demo/artifacts must show lawyer-review-required label");
}
if (!/(unsupported_general_query|unsupported landlord|Unsupported Landlord Query)/i.test(publicDemo)) {
  fail("public demo/artifacts must include unsupported query abstention demo");
}
if (!/(abstain|abstention|No case-by-case authority is attached)/i.test(publicDemo)) {
  fail("unsupported query demo must show abstention/no-authority boundary");
}
if (!/(Demoted principles|demoted principles|demoted_principle_count|247)/i.test(publicDemo)) {
  fail("public demo/artifacts must show demoted-principle boundary");
}
if (/(answer_safe:\s*true|Answer safe:\s*`true`|"answer_safe":\s*true)/i.test(publicDemo)) {
  fail("public demo must not show answer_safe=true");
}

if (errors.length) {
  console.error("Public demo source-link validation failed:");
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log("Public demo source-link validation passed.");
