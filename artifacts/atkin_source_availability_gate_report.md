# Atkin Source Availability Gate Report

Generated: 2026-07-07T18:58:54.561Z

Status: `ATKIN_SOURCE_AVAILABLE_METADATA_INGESTION_ALLOWED`

| Check | Value |
|---|---:|
| Original source files | 365 |
| Supported source files | 361 |
| NotebookLM note files | 0 |
| Supported note files | 0 |
| Ingestion can proceed | yes |
| Only dry-run fixtures available | no |
| Private paths gitignored | yes |
| Private tracked files | 0 |
| Private text marker hits | 0 |

## Required Paths

- Source forms: `private_uploads/atkin_forms/`
- NotebookLM notes: `private_notebooklm_notes/`

## Boundary

No real Atkin ingestion is complete unless source forms are locally present. If status is `REAL_ATKIN_INGESTION_BLOCKED_SOURCE_NOT_PRESENT`, continue only with audit/export-contract work.
