# PR6 Production Release Readiness

Generated: 2026-07-01T00:00:00+08:00

Branch: `pr6-production-release`
Base: `origin/main` (00d74184150c)
Changed files in release slice: **90**
Draft PR: https://github.com/RexHannes/hk-criminal-procedure-graphrag/pull/10 (`mergeable_state=clean`, draft)
GitHub Actions: latest branch push success; see https://github.com/RexHannes/hk-criminal-procedure-graphrag/actions?query=branch%3Apr6-production-release
Vercel branch preview: https://hk-criminal-procedure-graphra-git-68eb5d-montycareless-projects.vercel.app/viewer/

## Recommendation

**Use this smaller branch as the production-release candidate.** Local checks, GitHub Actions, and deployed viewer smoke pass. I still recommend one manual browser sanity check before merge because this is a visible boss/VC UI.

## What This Branch Contains

- Fable viewer preserved as `/viewer/` default.
- Native Verified Case Demo inside the workspace, with grouped case cards and collapsed paragraph proof lists.
- Case-authority bridge, viewer evidence index, backend search/inspector retrieval, six law-tree packs, validators, and demo reports.
- No 10k/25k scaling run and no standalone raw demo page as the product surface.

## Diversity

Law-tree diversity pass: **6/6**
Leading-case cluster exception: criminal_public_order.assembly_proportionality

## Evals

- Case recall Level 1: 9/9
- AI Inquiry Level 2: 7/7
- Law-tree Level 1: 6/6
- Law-tree Level 2: 6/6

## Remaining Before Merge

- keep PR #10 draft until owner sanity check is complete
- manual UI sanity check in browser by project owner
- confirm whether to merge this smaller branch instead of PR #6 draft
