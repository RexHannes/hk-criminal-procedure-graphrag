#!/usr/bin/env node
/* Validate the frozen PR 6 boss-demo assets and output boundaries. */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "artifacts", "demo_outputs");
const DOC_PATH = path.join(ROOT, "docs", "pr6-presentation-status.md");
const README_PATH = path.join(ROOT, "README.md");
const VIEWER_PATH = path.join(ROOT, "viewer", "app.js");

const EXPECTED = [
  {
    id: "demo-a-theft-no-evidence",
    mode: "demo_supported",
    must: ["AR/MR", "dishonesty", "intention permanently", "Evidence Analysis", "Chan", "Khan"],
    mustNot: ["unsupported_general_query"],
  },
  {
    id: "demo-b-theft-with-evidence-text",
    mode: "demo_supported",
    must: ["uploaded_evidence_ingested: true", "visible", "paid", "phone call", "immediately offered to pay", "not legal authority"],
      mustNot: ["no uploaded evidence has been parsed", "professional_advice_certified: true"],
  },
  {
    id: "demo-c-unsupported-landlord-rent",
    mode: "unsupported_general_query",
    must: ["unsupported_general_query", "outside the currently source-gated demo verticals", "No final legal proposition"],
      mustNot: ["demo_supported", "professional_advice_certified: true"],
  },
];

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

function read(file, errors) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch (error) {
    errors.push(`missing file: ${path.relative(ROOT, file)}`);
    return "";
  }
}

const errors = [];
const doc = read(DOC_PATH, errors);
const readme = read(README_PATH, errors);
const viewer = read(VIEWER_PATH, errors);
const manifest = read(path.join(OUT_DIR, "manifest.json"), errors);

assert(doc.includes("Do not add a third vertical"), "presentation doc must freeze third-vertical expansion", errors);
assert(doc.includes("Demo A - Theft Without Uploaded Evidence"), "presentation doc missing Demo A", errors);
assert(doc.includes("Demo B - Theft With Uploaded Text Evidence"), "presentation doc missing Demo B", errors);
assert(doc.includes("Demo C - Unsupported General Query"), "presentation doc missing Demo C", errors);
assert(doc.includes("\"evidence_text\""), "presentation doc missing copied evidence_text JSON request", errors);
assert(readme.includes("PR 6 Demo Boundary"), "README missing PR 6 demo boundary section", errors);
assert(viewer.includes("${esc(productCopy(String(productMode.mode)))}"), "viewer should display a clean product-mode label", errors);
assert(viewer.includes("Uploaded text evidence:"), "viewer collapsed audit should show evidence status", errors);

let parsedManifest = { demos: [] };
try {
  parsedManifest = JSON.parse(manifest || "{}");
} catch (error) {
  errors.push("manifest.json is not valid JSON");
}

for (const expected of EXPECTED) {
  const file = path.join(OUT_DIR, `${expected.id}.md`);
  const content = read(file, errors);
  const lower = content.toLowerCase();
  const item = (parsedManifest.demos || []).find(demo => demo.id === expected.id);
  assert(item, `manifest missing ${expected.id}`, errors);
  assert(content.includes(`product_mode: "${expected.mode}"`), `${expected.id}: wrong product_mode front matter`, errors);
  assert(content.includes(`Mode: \`${expected.mode}\``), `${expected.id}: wrong product mode section`, errors);
    assert(content.includes("answer_mode: \"research_prototype\""), `${expected.id}: answer mode missing`, errors);
    assert(content.includes("professional_advice_certified: false"), `${expected.id}: professional certification boundary missing`, errors);
  assert(content.includes("## Legal Memo"), `${expected.id}: legal memo section missing`, errors);
  for (const needle of expected.must) {
    assert(lower.includes(needle.toLowerCase()), `${expected.id}: expected content missing: ${needle}`, errors);
  }
  for (const needle of expected.mustNot) {
    assert(!lower.includes(needle.toLowerCase()), `${expected.id}: forbidden content present: ${needle}`, errors);
  }
}

if (errors.length) {
  console.error("PR 6 demo asset validation failed:");
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log("PR 6 demo asset validation passed.");
