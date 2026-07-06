# Private Form Ingestion Dry Run Report

Generated: 2026-07-06T00:00:00.000Z

## Privacy Boundary

- Private ZIPs/forms are read only from `private_uploads/`.
- Extracted private text is written only to gitignored `private_ingest_output/`.
- NotebookLM/internal notes are read only from gitignored `private_notebooklm_notes/`.
- This committed report contains metadata only: counts, distributions, warnings, and review-gate state.
- Candidate titles are redacted by default unless `--include-safe-titles` is used locally.
- No private content is sent to external services.

## Summary

| Metric | Value |
|---|---:|
| Packs processed | 0 |
| Templates detected | 0 |
| Clauses detected | 0 |
| NotebookLM notes linked | 0 |
| Classification reviews created | 0 |
| Templates inactive until review | yes |
| Manual classification required | 0% |
| Extraction warnings | 0 |
| Rejected/suspicious files | 0 |

## Pack Results

_No private packs were found in `private_uploads/` during this run._

## Recommended Manual Review Actions

- Place private ZIPs/forms under private_uploads/ and optional NotebookLM notes under private_notebooklm_notes/.
- Run node scripts/run_private_form_ingestion_dry_run.js locally.
- Inspect gitignored private_ingest_output/ before approving any template.

## Remaining Limitations

- DOC/PDF extraction quality depends on local command-line tools and source formatting.
- Regex/keyword classifications are not lawyer-approved.
- Real/private templates must remain inactive until classification review is completed.
- Production private store mapping and reviewer permissions are not configured by this dry run.
