# PR #6 Merge Readiness Report

Generated: 2026-07-01 HKT

## Summary

PR #6 is good for a boss/VC demo from the preview, but it is **not production-merge-ready as-is**.

- PR: https://github.com/RexHannes/hk-criminal-procedure-graphrag/pull/6
- Head: `82f333e56a4365c093b5122a2d01376de7893220`
- PR recorded base: `12ba4e96a49a9a8453faf67023f190da78324c81`
- Current `origin/main`: `00d74184150cef784d4a3507b4c1ed1362b6f23d`
- Merge base: `12ba4e96a49a9a8453faf67023f190da78324c81`
- Draft: `true`
- GitHub mergeable: `false`
- Changed files: 281
- Additions/deletions: 184,336 / 384

## Mergeability

`origin/main` moved by 4 commits after the PR base, including PR #9. A dry merge with:

```bash
git merge-tree --write-tree origin/main HEAD
```

exited with code `1`, confirming real conflicts.

Conflict files:

| File | Conflict | Risk |
|---|---|---|
| `api/doctrine-evidence.js` | content | backend/API retrieval |
| `api/search-evidence.js` | content | domain routing and source-gated retrieval |
| `data/legal_domain_packs/demo_maps/civil_procedure_hk/flows.json` | add/add | domain-pack data |
| `data/legal_domain_packs/demo_maps/data_privacy_hk/flows.json` | add/add | domain-pack data |
| `scripts/build_investor_recall_corpus.js` | add/add | investor recall/scaling |
| `scripts/run_investor_recall_pipeline.js` | add/add | investor recall/scaling |
| `scripts/run_retrieval_benchmark.js` | content | retrieval benchmark |
| `scripts/validate_viewer_case_fruits.js` | content | viewer/case-fruit validation |
| `src/legal_answer/build_evidence_pack.js` | content | evidence-pack generation |
| `viewer/app.js` | content | Fable viewer integration |
| `viewer/index_legacy.html` | content | legacy-route labelling |

## Test Status

Fresh local smoke set on PR head passed:

- `node scripts/run_case_authority_pipeline.js`
- `node scripts/validate_verified_case_authority.js`
- `node scripts/validate_all_visible_cases_resolved_or_excluded.js`
- `node scripts/validate_no_visible_unverified_case_authorities.js`
- `node scripts/validate_backend_case_search_uses_verified_only.js`
- `node scripts/evaluate_case_recall_level1.js` (`9/9`)
- `node scripts/evaluate_ai_inquiry_level2.js` (`7/7`)
- `node scripts/validate_law_tree_case_fruit_packs.js` (`6 trees / 81 chunks`)
- `node scripts/evaluate_law_tree_case_fruit_level1.js` (`6/6`)
- `node scripts/evaluate_law_tree_case_fruit_level2.js` (`6/6`)
- `node scripts/smoke_test_viewer_ui_quality.js`
- `node scripts/validate_demo_readiness_pr6.js`
- `node scripts/smoke_test_pr6_demo_api.js --local-only --skip-network`
- `node scripts/validate_no_secrets_committed.js`
- `git diff --check`

GitHub Actions `validate` is green on `82f333e`. Vercel preview is READY.

## URLs

- Preview workspace: https://hk-criminal-procedure-graphrag-k9ffcsgku-montycareless-projects.vercel.app/viewer/
- Preview direct demo: https://hk-criminal-procedure-graphrag-k9ffcsgku-montycareless-projects.vercel.app/viewer/case_corpus_demo.html
- Production workspace: https://hk-criminal-procedure-graphrag.vercel.app/viewer/

Production is **not promoted to the PR #6 demo state**. Production smoke failed because `/viewer/case_corpus_demo.html` returned HTTP 404.

## Size / Split Risk

Change classification by path:

| Area | Files |
|---|---:|
| Core production/demo code | 36 |
| Case authority bridge | 6 |
| Viewer/Fable UI integration | 10 |
| Backend/API retrieval | 10 |
| Law-tree packs | 15 |
| Validators | 45 |
| Demo artifacts | 91 |
| Experimental/scaling artifacts | 46 |
| Old/dead artifacts | 0 |
| Other | 22 |

Major risks:

- Conflicts touch `viewer/app.js`, so resolving casually could damage the Fable viewer shell.
- Conflicts touch `api/search-evidence.js` and `api/doctrine-evidence.js`, so resolving casually could break probate routing, law-tree retrieval, or source-gated authority.
- PR #6 is very large and includes generated/demo/scaling artifacts beyond the minimum production path.
- Production does not yet have the verified demo route.

## Recommendation

Recommendation: **do not merge PR #6 as-is today**.

Preferred production path:

1. Create a smaller `pr6-production-release` branch from current `main`.
2. Cherry-pick only the necessary production/demo files:
   - Fable viewer preservation and verified demo integration;
   - case-authority bridge;
   - backend/API retrieval wiring;
   - six law-tree packs;
   - validators/smoke tests;
   - required demo artifacts only.
3. Leave older scaling, exploratory, and bulky generated artifacts out unless required by validators.
4. Run the full workflow and manual viewer sanity check.
5. Mark ready and merge only after `draft=false`, `mergeable=true`, CI green, and production smoke passes after promotion.

Acceptable alternative: resolve the listed conflicts in a dedicated integration branch, rerun the full workflow, and manually verify the Fable viewer before marking PR #6 ready.

Do **not** force-merge while `draft=true`, `mergeable=false`, and conflicts touch API/viewer files.
