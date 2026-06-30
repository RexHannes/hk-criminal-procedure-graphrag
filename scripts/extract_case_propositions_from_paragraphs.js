#!/usr/bin/env node
/* Deterministic L3 proposition extraction entrypoint for the committed sample.
 * Full LLM-assisted extraction remains candidate-only and must keep paragraph proof.
 */

const { spawnSync } = require("child_process");
const path = require("path");

const result = spawnSync(process.execPath, [path.join(__dirname, "build_case_corpus_l1_l35_sample.js")], {
  stdio: "inherit",
});
process.exit(result.status || 0);
