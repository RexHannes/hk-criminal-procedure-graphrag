#!/usr/bin/env node
/* Build L3 principle cards from paragraph-backed propositions for the sample corpus. */

const { spawnSync } = require("child_process");
const path = require("path");

const result = spawnSync(process.execPath, [path.join(__dirname, "build_case_corpus_l1_l35_sample.js")], {
  stdio: "inherit",
});
process.exit(result.status || 0);
