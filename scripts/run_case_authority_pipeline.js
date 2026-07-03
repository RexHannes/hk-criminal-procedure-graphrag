#!/usr/bin/env node
const { execSync } = require("child_process");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const steps = [
  "node scripts/inventory_all_visible_case_seeds.js",
  "node scripts/resolve_all_visible_case_sources.js",
  "node scripts/build_viewer_evidence_index.js",
  "node scripts/build_case_authority_registry.js",
  "node scripts/validate_all_visible_cases_resolved_or_excluded.js",
  "node scripts/validate_no_visible_unverified_case_authorities.js",
  "node scripts/validate_verified_case_authority.js",
  "node scripts/validate_case_authority_registry.js",
  "node scripts/validate_backend_case_search_uses_verified_only.js",
  "node scripts/build_structured_case_notes.js",
  "node scripts/validate_structured_case_notes.js",
  "node scripts/audit_case_authority_relevance.js",
  "node scripts/audit_law_tree_case_diversity.js",
  "node scripts/validate_sop_editing_demo.js",
  "node scripts/evaluate_case_recall_level1.js",
  "node scripts/evaluate_ai_inquiry_level2.js",
  "node scripts/evaluate_ai_inquiry_analysis_quality.js",
  "node scripts/validate_ai_inquiry_case_recall.js",
  "node scripts/generate_case_authority_final_report.js",
];

let failed = false;
for (const step of steps) {
  console.log(`\n> ${step}`);
  try {
    execSync(step, { cwd: ROOT, stdio: "inherit" });
  } catch (error) {
    failed = true;
    console.error(`Step failed: ${step}`);
    break;
  }
}
process.exit(failed ? 1 : 0);
