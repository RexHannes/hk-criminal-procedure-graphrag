#!/usr/bin/env node
/* Validate the public viewer workspace and the PR #6 verified source-proof demo route. */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const errors = [];

const REQUIRED_FILES = [
  "viewer/index.html",
  "viewer/app.js",
  "viewer/styles.css",
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
const workspace = [
  files.get("viewer/index.html"),
  files.get("viewer/app.js"),
  files.get("viewer/styles.css"),
].join("\n");

const verifiedDemo = [
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

assertIncludes(viewerIndex, "Legal Graph-SOP Workspace", "/viewer/");
assertIncludes(viewerIndex, "id=\"sidebar\"", "/viewer/");
assertIncludes(viewerIndex, "id=\"inspector\"", "/viewer/");
assertIncludes(viewerIndex, "data-view=\"flows\"", "/viewer/");
assertIncludes(viewerIndex, "data-view=\"doctrine\"", "/viewer/");
assertIncludes(viewerIndex, "data-view=\"caseDemo\"", "/viewer/");
assertIncludes(viewerIndex, "Verified Case Demo", "/viewer/");
assertIncludes(viewerIndex, "href=\"case_corpus_demo.html\"", "/viewer/");
assertIncludes(viewerIndex, "app.js", "/viewer/");
assertIncludes(workspace, "case-demo-frame", "workspace embedded verified demo");
assertIncludes(workspace, "Legacy seed graph - not the verified case-law demo.", "workspace seed graph banner");
if (/Static proof fallback for smoke tests|Source-proofed HK criminal-law research demo/.test(viewerIndex)) {
  fail("/viewer/ must be the polished workspace shell, not the raw verified proof page");
}
assertIncludes(demoHtml, "PR #6 verified case-corpus demo", "case_corpus_demo.html");
assertIncludes(demoHtml, "Source-proofed HK criminal-law research demo", "case_corpus_demo.html");
assertIncludes(demoHtml, "Back to workspace", "case_corpus_demo.html");
assertIncludes(demoJs, "demo_freeze_report.json", "case_corpus_demo.js");
assertIncludes(demoJs, "demo_query_pack.json", "case_corpus_demo.js");
assertIncludes(demoJs, "bail_research_memo.md", "case_corpus_demo.js");
assertIncludes(demoJs, "authority-card", "case_corpus_demo.js");
assertIncludes(demoJs, "source-panel", "case_corpus_demo.js");
if (/markdownToHtml|data-demo-markdown|```json|Static proof fallback for smoke tests/.test(demoHtml + demoJs)) {
  fail("verified demo must not render as raw markdown/JSON/audit dump");
}

assertIncludes(legacy, "Standalone seed graph viewer - unverified map", "seed graph viewer");
assertIncludes(legacy, "not the PR #6 verified case-corpus demo", "legacy viewer");
assertIncludes(legacy, "case_corpus_demo.html", "legacy viewer");

if (!/https?:\/\/(?:www\.)?(?:hklii\.hk|legalref\.judiciary\.hk)\//i.test(verifiedDemo)) {
  fail("verified demo/artifacts must contain at least one HKLII/LegalRef URL");
}
if (!/#p\d+/i.test(verifiedDemo)) fail("verified demo/artifacts must contain at least one #p paragraph anchor");
if (!/Exact quote:/i.test(verifiedDemo)) fail("verified demo/artifacts must contain at least one Exact quote");
if (!/(answer_safe=false|Answer safe:\s*`false`|Answer safe:\s*false)/i.test(verifiedDemo)) {
  fail("verified demo/artifacts must show answer_safe=false");
}
if (!/(lawyer-review-required|Lawyer review required|needs_lawyer_review=true|needs_lawyer_review":\s*true)/i.test(verifiedDemo)) {
  fail("verified demo/artifacts must show lawyer-review-required label");
}
if (!/(unsupported_general_query|unsupported landlord|Unsupported Landlord Query)/i.test(verifiedDemo)) {
  fail("verified demo/artifacts must include unsupported query abstention demo");
}
if (!/(abstain|abstention|No case-by-case authority is attached)/i.test(verifiedDemo)) {
  fail("unsupported query demo must show abstention/no-authority boundary");
}
if (!/(Demoted principles|demoted principles|demoted_principle_count|247)/i.test(verifiedDemo)) {
  fail("verified demo/artifacts must show demoted-principle boundary");
}
if (/(answer_safe:\s*true|Answer safe:\s*`true`|"answer_safe":\s*true)/i.test(verifiedDemo)) {
  fail("verified demo must not show answer_safe=true");
}

if (errors.length) {
  console.error("Public demo source-link validation failed:");
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log("Public demo source-link validation passed.");
