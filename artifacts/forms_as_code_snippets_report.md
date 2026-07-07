# Forms As Code Snippets MVP Report

Generated: 2026-07-06T00:00:00+08:00

## Status

Implemented as a hardened MVP foundation with a local/private Sem B + Downloads dry run, one focused real-lane approval pilot, and a routable court-form workflow layer. PR #11 should remain draft until production private-store configuration and reviewer permissions are selected.

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

A targeted local/private dry run processed the gitignored Sem B + Downloads packs into gitignored `private_ingest_output/`. The committed report is metadata-only.

```bash
node scripts/run_private_form_ingestion_dry_run.js --input private_uploads/targeted_sem_b_forms
```

It reads from `private_uploads/`, writes extracted output only to gitignored `private_ingest_output/`, and commits only metadata counts in `artifacts/private_form_ingestion_dry_run_report.*`.

| Metric | Count |
|---|---:|
| Packs processed | 5 |
| Templates detected | 27 |
| Clause-like segments detected | 1,150 |
| Classification reviews created | 27 |
| NotebookLM notes linked | 0 |
| Extraction warnings | 3 |
| Rejected/suspicious files | 0 |
| Manual classification required | 100% |

Detected lanes include probate, commercial contracts, company/corporate, company winding-up, originating summons/compliance, and financial/regulatory notes. All real/private templates remain `classificationStatus=machine_candidate`, `reviewStatus=lawyer_review_required`, and inactive until review.

## Approved Demo Subset

The branch now includes a synthetic/redacted approved subset proving the approval workflow:

| Metric | Count |
|---|---:|
| Approved PI templates | 3 |
| Approved clauses | 9 |
| Approved usage rules | 10 |
| Classification reviews | 3 |

All committed approved-demo clause text is synthetic/redacted and marked `privateTextCommitted=false`.

## Workflow Timeline Prototype

The branch now emits a separate forms/workflow timeline layer for the approved synthetic subset:

| Metric | Count |
|---|---:|
| Recommended demo forms | 1 |
| Timeline steps | 3 |
| CRM export rows | 3 |

The flow is Part 1 legal analysis/source classification, Part 2 document/snippet routing, and Part 3 CRM/workflow export. This is not public authority analysis and is not professional-advice certified.

## Focused Real-Lane Approval Pilot

Selected lane: `company_winding_up`.

Why selected: the dry run found multiple company winding-up candidates in the company/corporate packs, with no extraction warnings for the selected lane and clear routing gates for correct stage, wrong stage, and missing service evidence.

| Metric | Count |
|---|---:|
| Candidate templates reviewed | 4 |
| Candidate clause-like segments | 127 |
| Approved metadata templates | 1 |
| Needs manual review | 2 |
| Rejected/deferred | 1 |
| NotebookLM/private notes linked | 0 |
| Routing scenarios passed | 3 |
| Lane CRM export rows | 3 |

The approved lane fixture is redacted metadata only. It proves that one company winding-up petition metadata template can route when prerequisites are present, is blocked when the company is already in another procedure, and becomes placeholder-only when statutory demand/service evidence is missing.

## Court Forms -> Routable Backend Workflow

The branch now adds the backend layer needed to turn reviewed form metadata into document workflow suggestions without committing private text.

| Area | Result |
|---|---|
| Court-form dropzone contract | `scripts/ingest_court_form_dropzone.js` writes to gitignored private output only |
| Practice lane taxonomy | Probate, commercial contracts, company/corporate, company winding-up, PI, employment, criminal defence, and general litigation lanes separated |
| Stage mapping | Forms map to matter stages and document intents through structured rules |
| Review queue | Private/real candidates stay inactive until review activation metadata exists |
| Backend recall | Reviewed-only private form metadata can be recalled by lane, stage, role, and blockers |
| Part 2 advice | Documentary-flow output recommends, blocks, or marks templates placeholder-only |
| Part 3 timeline | CRM-export rows are generated from Part 1 legal analysis, Part 2 document flow, and Part 3 operations tasks |
| Viewer | Existing Fable Forms & Snippets workspace shows compact workflow cards, not raw reports |
| Vercel API shape | New workflow endpoints are rewrites into the existing Forms API handler to stay under the preview function cap |

Current metadata-only workflow metrics:

| Metric | Count |
|---|---:|
| Existing private packs represented | 5 |
| Templates detected in dry run | 27 |
| Review queue records | 27 |
| Reviewed backend index records | 2 |
| Reviewed matter document flows | 1 |
| Reviewed timeline rules | 1 |
| Part 2 recommended documents | 1 |
| Part 2 placeholder-only documents | 1 |
| Part 3 CRM rows | 3 |

The advice APIs keep the layers separate: public legal analysis is not polluted by private template recommendations, and private form recall only appears where the query is about drafting, forms, documents, or procedural workflow.

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
| Private taxonomy dry-run | Probate / contract / company / regulatory lanes separated |
| Approved-demo subset | Synthetic/redacted routing fixture validates approval workflow |
| Workflow timeline export | Part 1/2/3 timeline and CRM rows generated from synthetic approved subset |
| Real-lane approval pilot | One company winding-up metadata template approved for redacted routing |
| Real-lane wrong-stage gate | Company already in another procedure blocks petition routing |
| Real-lane missing prerequisite gate | Missing statutory demand/service evidence creates placeholder/evidence blocker |
| NotebookLM private link status | No private notes found; no note text committed; NotebookLM remains internal note metadata |
| Court-form dropzone | Local/private ingestion contract writes only to gitignored private output |
| Practice lane taxonomy | Structured lane classifier keeps company, probate, PI, contract, employment, criminal and litigation forms separate |
| Backend private recall | Reviewed-only metadata recall supports routeable document suggestions |
| Part 2 documentary flow | Missing facts and evidence blockers are surfaced before drafting |
| Part 3 timeline/CRM | Exportable rows generated without private form text |
| Advice separation | Legal authority, document suggestions, and workflow timeline are distinct response layers |
| Vercel function cap | Private recall, matter advice, and workflow timeline routes reuse the Forms API function via rewrites |

## Sem B Handling

The Sem B / Downloads material was processed locally into `private_ingest_output/` for a dry run. No private/licensed content was committed or sent to external services. Only metadata counts, distributions, warning counts, and review-gate state are committed.

## Limitations

- Real DOC/PDF extraction remains private and tool-dependent; current dry run records 3 extraction warnings.
- Lawyer approval is represented as metadata and review gates, not a full multi-user HITL workflow.
- The focused company winding-up lane approves routing metadata only, not private clause text or professional advice.
- The court-form workflow layer routes reviewed metadata only; it does not expose or commit private form wording.
- PR #11 is hardened but should remain draft until a production private-store mapping and reviewer permission model are configured.
- Production vector indexing should use private storage/Qdrant collections, not public fixtures.
