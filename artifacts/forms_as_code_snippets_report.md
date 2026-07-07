# Forms As Code Snippets MVP Report

Generated: 2026-07-08T00:00:00+08:00

## Status

Implemented as a hardened MVP foundation with a real local/private Atkin metadata ingestion, a private Qdrant dry-run contract, two selected redacted metadata activation lanes, and a routable court-form workflow layer. PR #11 should remain draft until production private-store configuration and reviewer permissions are selected.

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

## NotebookLM Cross-Check

NotebookLM/manual note outputs can now be parsed from `private_notebooklm_notes/` as scenario expectations. They remain `INTERNAL_USAGE_NOTE` metadata only, not legal authority, not the runtime engine, and not an approval gate.

| Metric | Count |
|---|---:|
| Scenarios parsed | 2 |
| Backend comparisons | 2 |
| Backend comparison mismatches | 0 |
| Private note text committed | 0 |

Mismatches are reported in `artifacts/notebooklm_backend_comparison_report.*`; they are not auto-fixed and do not activate templates.

## Expanded Lane Activation

Two additional redacted metadata lanes are now available for routing tests:

| Lane | Approved metadata templates | Approved redacted clauses |
|---|---:|---:|
| `family_service` | 2 | 4 |
| `company_winding_up_provisional_liquidator` | 2 | 4 |

Both selected lanes are now backed by matching real private-ingest candidate metadata, but the committed activation fixtures remain reviewed redacted metadata only. Raw private text stays out of git.

Selected-lane proof report: `artifacts/atkin_selected_lane_activation_report.md`.

| Lane | Real candidate templates | Real candidate chunks | Active real templates | Correct stage | Wrong stage block | Missing fact block | CRM rows |
|---|---:|---:|---:|---|---|---|---:|
| `family_service` | 115 | 593 | 0 | yes | yes | yes | 3 |
| `company_winding_up_provisional_liquidator` | 399 | 2,086 | 0 | yes | yes | yes | 3 |

## Private Draft Rendering

Local-only draft rendering now writes metadata output only under `private_exports/` and generates a committed metadata-only report:

| Metric | Status |
|---|---|
| Output scope | `private_exports/` only |
| Private text committed | no |
| Missing facts create placeholders/blockers | yes |
| Lawyer-only fields flagged | yes |

## Court Forms -> Routable Backend Workflow

The branch now adds the backend layer needed to turn reviewed form metadata into document workflow suggestions without committing private text.

| Area | Result |
|---|---|
| Court-form dropzone contract | `scripts/ingest_court_form_dropzone.js` writes to gitignored private output only |
| Practice lane taxonomy | Probate, commercial contracts, company/corporate, company winding-up, PI, employment, criminal defence, and general litigation lanes separated |
| Stage mapping | Forms map to matter stages and document intents through structured rules |
| Review queue | Private/real candidates stay inactive until review activation metadata exists |
| Backend recall | Reviewed-only private form metadata can be recalled by lane, stage, role, and blockers |
| Private semantic retrieval | Approved private clause chunks are ranked only after lane, stage, intent, role/matter, and missing-fact gates pass |
| Part 2 advice | Documentary-flow output recommends, blocks, or marks templates placeholder-only |
| Part 3 timeline | CRM-export rows are generated from Part 1 legal analysis, Part 2 document flow, and Part 3 operations tasks |
| Viewer | Existing Fable Forms & Snippets workspace shows compact workflow cards, not raw reports |
| Vercel API shape | Workflow modes run through `/api/forms/recommend?formsMode=...` to stay under the preview function cap |

Current metadata-only workflow metrics:

| Metric | Count |
|---|---:|
| Existing private packs represented | 5 |
| Templates detected in dry run | 27 |
| Review queue records | 27 |
| Reviewed backend index records | 2 |
| Approved private semantic chunks | 1 |
| Reviewed matter document flows | 1 |
| Reviewed timeline rules | 1 |
| Part 2 recommended documents | 1 |
| Part 2 placeholder-only documents | 1 |
| Part 3 CRM rows | 3 |

The advice APIs keep the layers separate: public legal analysis is not polluted by private template recommendations, and private form recall only appears where the query is about drafting, forms, documents, or procedural workflow.

## Private Atkin Forms RAG + Qdrant Lane

The branch now adds a private Atkin forms lane for Part 2 forms retrieval. NotebookLM remains cross-check/spec metadata only; it is not the runtime engine and does not approve templates.

| Area | Result |
|---|---|
| Local ingestion lane | `private_uploads/atkin_forms/` -> `private_ingest_output/atkin_forms/` |
| Current source status | Real local source available; metadata ingestion completed |
| Reports | `artifacts/atkin_private_rag_ingestion_report.*` |
| Private Qdrant collections | `hk_private_form_chunks_<tenant>_<workspace>` and `hk_private_form_templates_<tenant>_<workspace>` |
| API modes | `/api/forms/recommend?formsMode=private-qdrant-recall` and `private-form-framework` |
| API default | Disabled unless `PRIVATE_QDRANT_FORMS_ENABLED=true` |
| Embeddings | Local/offline hash vectors by default |
| Public legal collections touched | no |
| NotebookLM cross-check | `INTERNAL_USAGE_NOTE` reports only |
| Context-awareness eval | 5/5 passed |

Real-source metadata ingestion processed 71 packs, detected 2,212 template candidates and 15,802 clause chunks, created 2,212 classification-review records, and recorded 79 extraction warnings. All real candidates remain `classificationStatus=machine_candidate`, `reviewStatus=lawyer_review_required`, and inactive until specific review approval.

The Qdrant dry run scanned 68 private stores and detected 2,014 real template records plus 14,487 real clause records in the current output stores. It indexes zero real records by design because no real templates/chunks are approved yet. The payload shape is still validated with a redacted approved fixture: tenant/workspace filters, `source_visibility=private_form`, `part_layer=part_2_forms`, approved/reviewed status, practice lane, stage, document intent, role/matter filters, blockers, and legal-tree node IDs only.

Context-awareness checks now cover correct lane/stage/intent/role, wrong-stage blocking, missing-fact blocking, consent-route alternatives, and Part 1/2/3 separation.

## Fable Design Gap Audit

The Fable Part 2/Part 3 design has now been audited against the current PR #11 implementation before any further runtime expansion.

| Status | Count |
|---|---:|
| DONE | 3 |
| PARTIAL | 7 |
| MISSING | 1 |
| BLOCKED_BY_PRIVATE_SOURCE_ABSENCE | 1 |

Report: `artifacts/fable_part2_part3_gap_audit.md`.

The audit recommendation is to hold runtime expansion until source export, NotebookLM export, and production private backend design are ready.

## Atkin Source Availability

Source gate report: `artifacts/atkin_source_availability_gate_report.md`.

| Check | Status |
|---|---|
| Original source forms in `private_uploads/atkin_forms/` | yes |
| NotebookLM exported notes in `private_notebooklm_notes/` | no |
| Source form files | 365 |
| Supported source files | 361 |
| Ingestion can proceed | yes |
| Only dry-run fixtures available | no |
| Private paths gitignored | yes |
| Private text committed | no |

Current status: `ATKIN_SOURCE_AVAILABLE_METADATA_INGESTION_ALLOWED`.

## NotebookLM Export Contract

NotebookLM output must be exported manually into `private_notebooklm_notes/`. The contract is documented in `docs/notebooklm_export_contract_for_forms.md`, with schemas:

- `schemas/forms/notebooklm_form_usage_note.schema.json`
- `schemas/forms/notebooklm_scenario_expectation.schema.json`

Supported export filenames are:

```text
family_service.md
family_answer.md
family_children.md
family_ancillary_relief.md
company_winding_up.md
pi_forms.md
contract_commercial.md
probate.md
```

NotebookLM remains `INTERNAL_USAGE_NOTE`, does not activate forms, does not override review gates, and is not public authority.

## Current Real-Ingestion Status

Real Atkin metadata ingestion is complete for the local source folder now present under `private_uploads/atkin_forms/`.

Next manual action required: review selected private classification queues locally, then approve only specific templates/clauses into private stores. NotebookLM exports, if any, should still go into `private_notebooklm_notes/` as `INTERNAL_USAGE_NOTE` cross-check material only.

## Safety

- Real private forms committed: no.
- Committed fixtures under `fixtures/forms/` are synthetic or reviewed redacted metadata only.
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
- Private semantic retrieval is Part 2 only, uses approved private clause chunks only, and cannot override lane, stage, intent, role/matter, or missing-fact blockers.
- Private Qdrant recall is Part 2 only, disabled by default, and requires tenant/workspace filters plus reviewed approved chunks.
- Private form embeddings default to local/offline hash vectors; private form text is not sent to OpenRouter or other external embedding APIs.
- Private semantic chunks cross-link to legal-knowledge nodes by ID only; they are not public authority and are not committed as raw private text.
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
| Private semantic retrieval | Local private vector ranking runs only after structured blockers pass |
| Private Qdrant recall | Isolated private collections; tenant/workspace filters required; disabled by default |
| Atkin ingestion lane | Local/private source lane processed; real candidates remain inactive until review |
| NotebookLM Atkin cross-check | Framework and textbook scenario reports are internal-note metadata only |
| Context-awareness eval | Wrong stage, missing facts, and consent-route alternatives validated |
| Part 2 documentary flow | Missing facts and evidence blockers are surfaced before drafting |
| Part 3 timeline/CRM | Exportable rows generated without private form text |
| NotebookLM scenario cross-check | Parsed as internal usage-note metadata; backend comparison reports mismatches only |
| Expanded lane activation | Family-service and provisional-liquidator metadata lanes added with wrong-stage/missing-fact gates |
| Private draft rendering | Local-only output under `private_exports/`; public report has counts only |
| Anti-static runtime checks | Matter facts, wrong stage, and missing facts change backend output |
| Advice separation | Legal authority, document suggestions, and workflow timeline are distinct response layers |
| Vercel function cap | Private recall, matter advice, and workflow timeline modes reuse the Forms API function |

## Sem B Handling

The Sem B / Downloads material was processed locally into `private_ingest_output/` for a dry run. No private/licensed content was committed or sent to external services. Only metadata counts, distributions, warning counts, and review-gate state are committed.

## Limitations

- Real DOC/PDF extraction remains private and tool-dependent; current Atkin metadata ingestion records 79 extraction warnings.
- Lawyer approval is represented as metadata and review gates, not a full multi-user HITL workflow.
- The focused company winding-up lane approves routing metadata only, not private clause text or professional advice.
- The court-form workflow layer routes reviewed metadata only; it does not expose or commit private form wording.
- NotebookLM cross-checks are comparison/audit metadata only and do not activate or approve templates.
- Real Atkin candidates remain machine-candidate/review-required and inactive until specific review approval.
- Private Qdrant dry-run finds zero real approved chunks by design; selected lane behavior is proven with reviewed redacted metadata fixtures only.
- Private Qdrant recall is disabled by default and needs server-side tenant/workspace configuration before production use.
- Local/offline hash embeddings are the default for private forms. Any external private embedding provider needs a separate explicit approval.
- Private draft rendering writes only to `private_exports/` and is not a deployed production drafting endpoint.
- PR #11 is hardened but should remain draft until a production private-store mapping and reviewer permission model are configured.
- Production vector indexing should use private storage/Qdrant collections, not public fixtures.
