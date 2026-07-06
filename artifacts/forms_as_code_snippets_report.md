# Forms As Code Snippets MVP Report

Generated: 2026-07-06T00:00:00+08:00

## Status

Implemented as an MVP foundation.

The branch adds private precedent/form ingestion, schema definitions, clause extraction, usage rules, NotebookLM usage-note parsing, structured retrieval, procedural gates, draft-from-template placeholders, APIs, validators, synthetic demo fixtures, and a native Forms & Snippets workspace inside the existing viewer.

## Synthetic Demo

| Metric | Count |
|---|---:|
| Form packs processed | 1 |
| Templates extracted | 4 |
| Clause snippets extracted | 19 |
| Usage rules inferred | 20 |
| NotebookLM/internal notes linked | 1 |
| Private-form index records | 23 |

## Safety

- Real private forms committed: no.
- Synthetic fixtures only under `fixtures/forms/`.
- Private inputs/outputs gitignored.
- NotebookLM notes are labelled `INTERNAL_USAGE_NOTE`.
- Private templates are labelled `TEMPLATE_BASED`.
- Structured filters run before keyword/vector retrieval.
- Vector-only retrieval is disallowed.
- Missing facts create placeholders/evidence tasks instead of invented facts.

## Sem B Handling

The Sem B / Downloads material was inventoried by metadata only. No private/licensed content was committed or sent to external services. Real ingestion should run locally into `private_ingest_output/` after confirming rights to use the pack.

## Limitations

- Real DOC/PDF extraction remains private and tool-dependent.
- Lawyer approval is represented as metadata and review gates, not a full multi-user HITL workflow.
- Production vector indexing should use private storage/Qdrant collections, not public fixtures.
