# Fable Part 2/Part 3 Gap Audit

Generated: 2026-07-07T00:00:00+08:00

Baseline: user-supplied Fable Part 2/Part 3 design. NotebookLM remains `INTERNAL_USAGE_NOTE` only.

Current PR #11 head at audit start: `0a037e378961e528045457d518ec14a84e9866bb`.

## Summary

| Status | Count |
|---|---:|
| DONE | 3 |
| PARTIAL | 7 |
| MISSING | 1 |
| BLOCKED_BY_PRIVATE_SOURCE_ABSENCE | 1 |
| NOT_YET_NEEDED | 0 |

## Findings

| Area | Status | Current gap |
|---|---|---|
| Product architecture | PARTIAL | Part 1/2/3 separation exists, but no full matter-store-backed live recompute engine or persisted amendment model yet. |
| Data architecture | PARTIAL | Private stores and provenance exist; persistent matter/SOP stores are still fixture/rule-level. |
| Private retrieval / Qdrant architecture | PARTIAL | Qdrant contract and validators exist; real private Atkin chunks are absent because source files are absent. |
| NotebookLM cross-check architecture | PARTIAL | NotebookLM is non-runtime/non-authority; exact export contract and schemas are added in this pass, but no exported notes are present. |
| Part 2 documentary-flow design | PARTIAL | Recommended/placeholder/missing-fact flow exists; full Fable schema coverage across lanes is not complete. |
| Part 3 timeline/CRM design | PARTIAL | Timeline/CRM prototype exists; amendment overlay and due-date basis are not implemented. |
| UI/UX design | PARTIAL | Fable shell and forms workspace cards exist; no full three-panel live recompute workspace. |
| Backend/API design | PARTIAL | Existing `/api/forms/recommend` modes are present; no full matter CRUD/amendment/review API. |
| Validator plan | DONE | Safety and separation validators exist; frozen NotebookLM scenario regression awaits exported notes. |
| Report plan | DONE | Metadata-only reports exist; this gap audit and source gate fill the missing report layer. |
| Private draft rendering | DONE | Local-only renderer and validators exist; not a production drafting endpoint. |
| Production private backend plan | MISSING | No encrypted private object store, reviewer permission model, raw-text access audit, or production tenant provisioning implementation yet. |
| Real Atkin source ingestion | BLOCKED_BY_PRIVATE_SOURCE_ABSENCE | `private_uploads/atkin_forms/` is empty; real ingestion cannot be claimed. |

## Recommendation

Hold runtime expansion. Complete source export, NotebookLM export, and production private backend design before broadening Part 2/Part 3 beyond the current metadata-only prototype.
