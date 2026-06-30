#!/usr/bin/env node
/*
 * Rebuild the viewer/search authority artifacts from paragraph-linked public
 * proof. This does not mark anything answer_safe; it only makes source-linked
 * public judgments usable by the research prototype.
 */

const { spawnSync } = require("child_process");

function run(args) {
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}

run(["scripts/build_viewer_case_evidence_index.js"]);
run(["scripts/build_case_authority_registry.js"]);

console.log("Verified public paragraph authorities are rebuilt for research-prototype retrieval.");
