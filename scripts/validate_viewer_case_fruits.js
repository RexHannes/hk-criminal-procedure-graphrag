#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

function assertContains(label, haystack, needle) {
  if (!haystack.includes(needle)) {
    throw new Error(`${label} missing required marker: ${needle}`);
  }
}

function main() {
  const app = read("viewer/app.js");
  const css = read("viewer/styles.css");
  const localEvidence = read("src/case_graph/local_case_fruit_evidence.js");

  [
    "/api/doctrine-evidence",
    "CASE_FRUIT_ARTIFACTS",
    "loadLocalCaseFruitArtifacts",
    "l5_paragraph_proof.json",
    "viewer_evidence_index.json",
    "Paragraph-linked sample",
    "Full paragraph text / audit trail",
  ].forEach(marker => assertContains("viewer/app.js", app, marker));

  [
    "tree_gap_pilots",
    "sedition_public_expression_v1",
    "public_order_riot_v1",
  ].forEach(marker => assertContains("local_case_fruit_evidence.js", localEvidence, marker));

  [
    ".fruit-card",
    ".fruit-quote",
    ".fruit-paragraph mark",
    ".badge-source-linked",
  ].forEach(marker => assertContains("viewer/styles.css", css, marker));

  console.log(JSON.stringify({
    ok: true,
    checks: [
      "viewer calls doctrine evidence API",
      "viewer has static L4/L5 artifact fallback",
      "tree-gap pilots are included in local evidence fallback",
      "source-linked case fruit styles are present",
    ],
  }, null, 2));
}

main();
