#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { compareBackendAgainstNotebooklm } = require("../src/forms/notebooklm_backend_comparator");
const { parseNotebooklmScenarios } = require("../src/forms/notebooklm_scenario_parser");
const { writeJson } = require("../src/forms/form_system");

const ARTIFACTS = path.join(process.cwd(), "artifacts");
const GENERATED_AT = "2026-07-07T00:00:00+08:00";

function mdList(items) {
  return (items || []).map(item => `- ${item}`).join("\n") || "- none";
}

function run() {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  const parsed = parseNotebooklmScenarios();
  const scenarioMetadata = parsed.scenarios.map(scenario => ({
    scenario_id: scenario.scenarioId,
    source_file: scenario.sourceFile,
    source_hash: scenario.sourceHash,
    source_text_committed: false,
    provenance: "INTERNAL_USAGE_NOTE",
    notebooklm_is_authority: false,
    expected_practice_lane: scenario.expected.practiceLane,
    expected_workflow_stage: scenario.expected.workflowStage,
    expected_recommended_forms: scenario.expected.recommendedForms,
    expected_blocked_forms: scenario.expected.blockedForms,
    missing_facts: scenario.expected.missingFacts,
    required_evidence: scenario.expected.requiredEvidence,
    draftability: scenario.expected.draftability,
    timeline_task_count: scenario.expected.timelineTasks.length,
    citation_reference_count: scenario.expected.citationsOrSourceReferences.length,
  }));
  const crosscheckReport = {
    report_id: "notebooklm_crosscheck",
    generated_at: GENERATED_AT,
    parser_version: parsed.parserVersion,
    private_note_text_committed: false,
    notebooklm_is_authority: false,
    provenance: "INTERNAL_USAGE_NOTE",
    notes_dir: "private_notebooklm_notes/",
    files_found: parsed.filesFound,
    expected_note_files: parsed.expectedNoteFiles,
    used_sanitized_fallback: parsed.usedFallback,
    scenario_count: scenarioMetadata.length,
    scenarios: scenarioMetadata,
  };
  writeJson(path.join(ARTIFACTS, "notebooklm_crosscheck_report.json"), crosscheckReport);
  fs.writeFileSync(path.join(ARTIFACTS, "notebooklm_crosscheck_report.md"), `# NotebookLM Crosscheck Report\n\nGenerated: ${GENERATED_AT}\n\nNotebookLM notes are parsed as \`INTERNAL_USAGE_NOTE\` metadata only. No note text is committed.\n\n| Metric | Count |\n|---|---:|\n| Files found | ${crosscheckReport.files_found.length} |\n| Scenarios parsed | ${crosscheckReport.scenario_count} |\n| Sanitized fallback used | ${crosscheckReport.used_sanitized_fallback ? 1 : 0} |\n\n## Expected Note Files\n\n${mdList(crosscheckReport.expected_note_files)}\n\n## Scenario IDs\n\n${mdList(crosscheckReport.scenarios.map(item => item.scenario_id))}\n`);

  const comparison = compareBackendAgainstNotebooklm(parsed.scenarios);
  const comparisonReport = {
    report_id: "notebooklm_backend_comparison",
    generated_at: GENERATED_AT,
    private_note_text_committed: false,
    notebooklm_is_authority: false,
    provenance: "INTERNAL_USAGE_NOTE",
    notebooklm_overrides_review_gates: false,
    mismatches_auto_fixed: false,
    compared_count: comparison.comparedCount,
    mismatch_count: comparison.mismatchCount,
    comparisons: comparison.comparisons,
  };
  writeJson(path.join(ARTIFACTS, "notebooklm_backend_comparison_report.json"), comparisonReport);
  fs.writeFileSync(path.join(ARTIFACTS, "notebooklm_backend_comparison_report.md"), `# NotebookLM Backend Comparison Report\n\nGenerated: ${GENERATED_AT}\n\nBackend output is compared against NotebookLM expected metadata. Mismatches are reported, not auto-fixed.\n\n| Metric | Count |\n|---|---:|\n| Compared scenarios | ${comparisonReport.compared_count} |\n| Mismatches | ${comparisonReport.mismatch_count} |\n\nNotebookLM authority: no.\n\nNotebookLM activates templates: no.\n`);
  console.log(JSON.stringify({
    scenarios: crosscheckReport.scenario_count,
    compared: comparisonReport.compared_count,
    mismatches: comparisonReport.mismatch_count,
    privateNoteTextCommitted: false,
  }, null, 2));
}

if (require.main === module) run();
