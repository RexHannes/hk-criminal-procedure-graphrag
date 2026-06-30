#!/usr/bin/env node
/* Rebuild the verified case-authority bridge artifacts in deterministic order. */

const { spawnSync } = require("child_process");

const steps = [
  "build_viewer_case_evidence_index.js",
  "build_case_authority_registry.js",
  "inventory_all_visible_case_seeds.js",
  "resolve_all_visible_case_sources.js",
  "build_excluded_unverified_case_seeds_report.js",
  "build_law_tree_case_fruit_packs.js",
  "validate_law_tree_case_fruit_packs.js",
  "evaluate_law_tree_case_fruit_level1.js",
  "evaluate_law_tree_case_fruit_level2.js",
  "generate_case_authority_final_report.js",
];

for (const script of steps) {
  const result = spawnSync(process.execPath, [`scripts/${script}`], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log("Case authority pipeline completed.");
