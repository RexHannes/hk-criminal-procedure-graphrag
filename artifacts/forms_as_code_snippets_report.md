# Forms As Code Snippets MVP Report

Generated: 2026-07-06T00:00:00+08:00

## Status

Implemented as a hardened MVP foundation. PR #11 should remain draft until production private-store configuration and reviewer permissions are selected.

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

## Private Dry Run

No private uploads were present in this checkout, so the committed dry-run report records `no_private_uploads_found`. The local runner is now in place:

```bash
node scripts/run_private_form_ingestion_dry_run.js
```

It reads from `private_uploads/`, writes extracted output only to gitignored `private_ingest_output/`, and commits only metadata counts in `artifacts/private_form_ingestion_dry_run_report.*`.

## Approved Demo Subset

The branch now includes a synthetic/redacted approved subset proving the approval workflow:

| Metric | Count |
|---|---:|
| Approved PI templates | 3 |
| Approved clauses | 9 |
| Approved usage rules | 10 |
| Classification reviews | 3 |

All committed approved-demo clause text is synthetic/redacted and marked `privateTextCommitted=false`.

## Safety

- Real private forms committed: no.
- Synthetic fixtures only under `fixtures/forms/`.
- Private inputs/outputs gitignored.
- `FORMS_PRIVATE_API_ENABLED=false` by default.
- Production/Vercel private ingestion returns `403`.
- Request-provided `store`, `storePath`, `input`, and `output` are not accepted by public forms APIs.
- Store selection is by `firmId` + `workspaceId` through server-side configuration.
- NotebookLM notes are labelled `INTERNAL_USAGE_NOTE`.
- NotebookLM template/clause links are candidate links until reviewed; token overlap is not approval.
- Private templates are labelled `TEMPLATE_BASED`.
- Real/private ingested templates start as `classificationStatus=machine_candidate` and `reviewStatus=lawyer_review_required`.
- Real/private machine candidates are inactive in routing unless reviewed or explicitly allowed in demo/local mode.
- Structured filters run before keyword/vector retrieval.
- Vector-only retrieval is disallowed.
- Missing facts create placeholders/evidence tasks instead of invented facts.

## Hardening Added

| Area | Result |
|---|---|
| Private path API access | Blocked |
| Classification review queue | Enabled |
| NotebookLM link review status | Candidate until reviewed |
| Adversarial routing | Criminal/probate/principle-only queries do not return PI forms |
| Wrong-stage gates | Writ/letter/finalisation blockers tested |
| Draft provenance | Field provenance, fact trace, placeholder audit, lawyer-only gate |
| Forms/principles separation | Private form recommendations stay separate from public authority analysis |
| Private ingestion dry-run report | Metadata-only; no private text committed |
| Approved-demo subset | Synthetic/redacted routing fixture validates approval workflow |

## Sem B Handling

The Sem B / Downloads material was inventoried by metadata only. No private/licensed content was committed or sent to external services. Real ingestion should run locally into `private_ingest_output/` after confirming rights to use the pack.

## Limitations

- Real DOC/PDF extraction remains private and tool-dependent.
- Lawyer approval is represented as metadata and review gates, not a full multi-user HITL workflow.
- PR #11 is hardened but should remain draft until a production private-store mapping and reviewer permission model are configured.
- Production vector indexing should use private storage/Qdrant collections, not public fixtures.
