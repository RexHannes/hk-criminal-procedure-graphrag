#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { writeJson } = require("../src/forms/form_system");

const ROOT = process.cwd();
const SOURCE_DIR = path.join(ROOT, "private_uploads", "atkin_forms");
const NOTES_DIR = path.join(ROOT, "private_notebooklm_notes");
const REPORT_JSON = path.join(ROOT, "artifacts", "atkin_source_availability_gate_report.json");
const REPORT_MD = path.join(ROOT, "artifacts", "atkin_source_availability_gate_report.md");
const SUPPORTED_SOURCE_EXT = new Set([".zip", ".docx", ".doc", ".pdf", ".txt", ".md", ".markdown"]);
const SUPPORTED_NOTE_EXT = new Set([".md", ".markdown", ".txt", ".json"]);
const REQUIRED_IGNORED_PATHS = [
  { path: "private_uploads/atkin_forms", probe: "private_uploads/atkin_forms/source_probe.docx" },
  { path: "private_notebooklm_notes", probe: "private_notebooklm_notes/note_probe.md" },
  { path: "private_ingest_output/atkin_forms", probe: "private_ingest_output/atkin_forms/probe.json" },
  { path: "private_exports", probe: "private_exports/draft_probe.json" },
];

function listFilesRecursive(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFilesRecursive(full));
    else out.push(full);
  }
  return out;
}

function rel(file) {
  return path.relative(ROOT, file);
}

function countSupported(files, allowed) {
  return files.filter(file => allowed.has(path.extname(file).toLowerCase())).length;
}

function gitOutput(args) {
  try {
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });
  } catch (error) {
    return "";
  }
}

function ignoredStatus() {
  return REQUIRED_IGNORED_PATHS.map(item => {
    const output = gitOutput(["check-ignore", "-v", item.probe]).trim();
    return {
      path: item.path,
      gitignored: Boolean(output),
      rule: output,
    };
  });
}

function trackedPrivateFiles() {
  return gitOutput(["ls-files"])
    .split(/\r?\n/)
    .filter(Boolean)
    .filter(file => file.startsWith("private_uploads/")
      || file.startsWith("private_notebooklm_notes/")
      || file.startsWith("private_ingest_output/")
      || file.startsWith("private_exports/"));
}

function trackedTextMarkerHits() {
  const files = gitOutput(["ls-files", "artifacts", "docs/notebooklm_export_contract_for_forms.md", "schemas/forms"])
    .split(/\r?\n/)
    .filter(Boolean)
    .filter(file => /\.(json|md|yml|yaml)$/i.test(file))
    .filter(file => /(^artifacts\/(atkin|fable|notebooklm_atkin|textbook_scenario|private_forms_context_awareness)|^docs\/notebooklm_export_contract_for_forms\.md$|^schemas\/forms\/notebooklm_)/.test(file));
  const forbidden = [/Dear Sirs/i, /WITHOUT PREJUDICE/i, /\bAtkins\b/i, /Consultancy agreement/i, /formw\d/i, /\/Users\/puiyuenwong/i];
  const hits = [];
  for (const file of files) {
    const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
    for (const pattern of forbidden) {
      if (pattern.test(text)) hits.push({ file, marker: String(pattern) });
    }
  }
  return hits;
}

function markdown(report) {
  return `# Atkin Source Availability Gate Report

Generated: ${report.generated_at}

Status: \`${report.status}\`

| Check | Value |
|---|---:|
| Original source files | ${report.source_forms.file_count} |
| Supported source files | ${report.source_forms.supported_file_count} |
| NotebookLM note files | ${report.notebooklm_notes.file_count} |
| Supported note files | ${report.notebooklm_notes.supported_file_count} |
| Ingestion can proceed | ${report.ingestion_can_proceed ? "yes" : "no"} |
| Only dry-run fixtures available | ${report.only_dry_run_fixtures_available ? "yes" : "no"} |
| Private paths gitignored | ${report.private_paths_gitignored ? "yes" : "no"} |
| Private tracked files | ${report.tracked_private_files.length} |
| Private text marker hits | ${report.private_text_marker_hits.length} |

## Required Paths

- Source forms: \`private_uploads/atkin_forms/\`
- NotebookLM notes: \`private_notebooklm_notes/\`

## Boundary

No real Atkin ingestion is complete unless source forms are locally present. If status is \`REAL_ATKIN_INGESTION_BLOCKED_SOURCE_NOT_PRESENT\`, continue only with audit/export-contract work.
`;
}

function run() {
  fs.mkdirSync(SOURCE_DIR, { recursive: true });
  fs.mkdirSync(NOTES_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(REPORT_JSON), { recursive: true });
  const sourceFiles = listFilesRecursive(SOURCE_DIR);
  const noteFiles = listFilesRecursive(NOTES_DIR);
  const sourceSupported = countSupported(sourceFiles, SUPPORTED_SOURCE_EXT);
  const noteSupported = countSupported(noteFiles, SUPPORTED_NOTE_EXT);
  const ignored = ignoredStatus();
  const trackedPrivate = trackedPrivateFiles();
  const markerHits = trackedTextMarkerHits();
  const sourceAvailable = sourceSupported > 0;
  const notesAvailable = noteSupported > 0;
  const privatePathsGitignored = ignored.every(item => item.gitignored);
  const report = {
    report_id: "atkin_source_availability_gate",
    generated_at: sourceAvailable || notesAvailable ? new Date().toISOString() : "2026-07-07T00:00:00+08:00",
    status: sourceAvailable ? "ATKIN_SOURCE_AVAILABLE_METADATA_INGESTION_ALLOWED" : "REAL_ATKIN_INGESTION_BLOCKED_SOURCE_NOT_PRESENT",
    source_forms: {
      directory: "private_uploads/atkin_forms/",
      available: sourceAvailable,
      file_count: sourceFiles.length,
      supported_file_count: sourceSupported,
      supported_extensions: Array.from(SUPPORTED_SOURCE_EXT).sort(),
      sample_files: sourceFiles.slice(0, 10).map(rel),
    },
    notebooklm_notes: {
      directory: "private_notebooklm_notes/",
      available: notesAvailable,
      file_count: noteFiles.length,
      supported_file_count: noteSupported,
      supported_extensions: Array.from(SUPPORTED_NOTE_EXT).sort(),
      sample_files: noteFiles.slice(0, 10).map(rel),
      provenance: "INTERNAL_USAGE_NOTE",
    },
    ingestion_can_proceed: sourceAvailable,
    notebooklm_crosscheck_can_proceed: notesAvailable,
    only_dry_run_fixtures_available: !sourceAvailable,
    private_paths_gitignored: privatePathsGitignored,
    gitignore_checks: ignored,
    tracked_private_files: trackedPrivate,
    private_text_committed: trackedPrivate.length > 0 || markerHits.length > 0,
    private_text_marker_hits: markerHits,
    ci_behavior: "non_failing_when_source_absent",
    next_manual_action_required: sourceAvailable
      ? "Run metadata-only private ingestion and review generated private output locally."
      : "Export original private source files into private_uploads/atkin_forms/ before claiming real Atkin ingestion.",
  };
  writeJson(REPORT_JSON, report);
  fs.writeFileSync(REPORT_MD, markdown(report));
  if (!privatePathsGitignored) {
    console.error("Private source paths are not all gitignored.");
    process.exit(1);
  }
  if (trackedPrivate.length || markerHits.length) {
    console.error("Private files or private text markers appear committed.");
    process.exit(1);
  }
  console.log(JSON.stringify({
    status: report.status,
    sourceFiles: report.source_forms.file_count,
    notebooklmNoteFiles: report.notebooklm_notes.file_count,
    ingestionCanProceed: report.ingestion_can_proceed,
  }, null, 2));
}

if (require.main === module) run();
