# PR #6 Viewer UX Recovery Check

Generated: 2026-06-30T00:00:00.000Z

## Scope

This check is limited to PR #6 demo wiring and viewer UX. It does not scale the corpus, train a model, merge PR #7/PR #8, or promote any output to `answer_safe`.

## Routes

| Route | Purpose | Boundary |
| --- | --- | --- |
| `/viewer/` | Polished Legal Graph-SOP Workspace default UI | Product workspace shell with a prominent Verified Case Demo entry |
| `/viewer/case_corpus_demo.html` | Direct source-proofed PR #6 case-law demo | Research-only, paragraph-linked, lawyer-review-required, `answer_safe=false` |
| `/viewer/index_legacy.html` | Standalone seed graph viewer | Seed-map research UI; not verified case-law authority |

## Acceptance Checklist

| Check | Status |
| --- | --- |
| `/viewer/` keeps the polished workspace shell with sidebar, inspector, legal flows, doctrine map, AI inquiry, and tasks | pass |
| `/viewer/` has a visible `Verified Case Demo` entry point | pass |
| Graph/domain views carry a seed-map warning and do not claim to be verified authority | pass |
| `/viewer/case_corpus_demo.html` is presentable and visually consistent with the workspace | pass |
| Direct demo shows 120 targeted cases, 344 paragraph cards, 344 propositions, 344 principle cards, 97 usable principles, and 247 demoted principles | pass |
| Direct demo shows HKLII/LegalRef links, paragraph anchors, exact quotes, source audit, and `answer_safe=false` | pass |
| Unsupported landlord/rent query abstains and does not cite criminal-law authority | pass |
| No top-level `Verification pending` badge is shown on the restored workspace | pass |
| Raw markdown/JSON/audit-dump rendering is blocked from the direct demo shell | pass |

## CI Guards

- `scripts/validate_public_demo_source_links.js`
- `scripts/smoke_test_viewer_ui_quality.js`
- `scripts/smoke_test_public_vercel_demo.js` when `PUBLIC_DEMO_URL` is set

## Demo Instruction

For boss/VC review, open `/viewer/` first to show the polished workspace. Then click `Verified Case Demo` in the workspace, or open `/viewer/case_corpus_demo.html` directly, to show the source-proofed case-law demo with paragraph-linked authorities.
