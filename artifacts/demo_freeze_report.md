# PR #6 Demo Freeze Report

Generated: 2026-06-30T00:00:00.000Z

## PR

- PR number: 6
- Branch: `codex/investor-recall-25k-path`
- Freeze baseline head commit: `f4e19a81fdd780eb7e685adc3f1a263a023dd935`
- Final head note: The final pushed PR head is recorded in the PR body after commit/push; a committed artifact cannot embed its own eventual commit SHA.

## Safe Demo Claim

> The system demonstrates a source-linked HK criminal-law case-law research prototype over a targeted 120-case L1-L3.5 sample. It retrieves public case authorities with paragraph anchors, exact quotes, extracted propositions/principles, issue mapping, demotion filtering, and answer-first research memos. It is not professional legal advice; professional certification is a later HITL product step.

## Corpus Counts

| Metric | Value |
| --- | --- |
| Cases | 120 |
| Paragraph cards | 344 |
| Proposition cards | 344 |
| Principle cards | 344 |
| Digest cards | 120 |
| Usable principles | 97 |
| Demoted principles preserved | 247 |
| Professional advice certified cards | 0 |

## Issue Coverage

| Issue | Cases | Coverage |
| --- | --- | --- |
| `criminal_law.theft` | 101 | demo-credible |
| `criminal_law.theft.dishonesty` | 30 | demo-credible |
| `criminal_law.theft.mens_rea` | 30 | demo-credible |
| `criminal_law.theft.appropriation` | 63 | demo-credible |
| `criminal_law.theft.belonging_to_another` | 13 | medium |
| `criminal_law.theft.intention_permanently_deprive` | 10 | medium |
| `criminal_law.theft.sentencing` | 94 | demo-credible |
| `criminal_law.fraud` | 56 | demo-credible |
| `criminal_law.deception` | 90 | demo-credible |
| `criminal_procedure.interview_caution` | 37 | demo-credible |
| `criminal_procedure.bail` | 15 | medium |

## Repaired Weak Targets

| Issue | Baseline | Current | Target | Met |
| --- | --- | --- | --- | --- |
| `criminal_law.theft.belonging_to_another` | 2 | 13 | 10 | yes |
| `criminal_law.theft.intention_permanently_deprive` | 0 | 10 | 10 | yes |
| `criminal_procedure.bail` | 8 | 15 | 15 | yes |

## Retrieval Metrics

| Metric | Value |
| --- | --- |
| precision_at_5 | 0.945455 |
| recall_at_10 | 0.909091 |
| legacy_corpus_recall_at_10 | 0.223482 |
| mrr | 1 |
| issue_match_rate | 0.909091 |
| exact_lookup_hit_rate | 1 |

## Source Proof Metrics

| Metric | Value |
| --- | --- |
| source_proof_rate | 1 |
| paragraph_quote_support_rate | 1 |
| wrong_domain_leak_rate | 0 |
| unsupported_query_abstention_rate | 1 |
| paragraph_match_rate | 1 |
| quote_support_match_rate | 1 |

## Public Demo URL

- Current PR preview URL source: Use the exact Vercel Preview URL recorded in the PR #6 body and GitHub deployment status for the current head commit.
- Production target URL after merge/promotion: https://hk-criminal-procedure-graphrag.vercel.app/viewer/
- Polished workspace route: /viewer/
- Verified case-corpus route: /viewer/case_corpus_demo.html
- Direct verified case-corpus route: /viewer/case_corpus_demo.html
- Seed graph viewer route: /viewer/index_legacy.html
- Page to show: For the unmerged draft PR, open the Vercel Preview deployment at /viewer/ to show the polished Legal Graph-SOP Workspace. Then click Verified Case Demo, or open /viewer/case_corpus_demo.html directly, for the source-proofed paragraph-linked case-law demo.
- Seed graph warning: Graph/domain views are seed-map research UI unless the source-proofed Verified Case Demo is opened. They are not the PR #6 paragraph-linked case-law authority view and must not be presented as verified authority.

## Safe Demo Instructions

- Open /viewer/ on the current Vercel Preview deployment to show the polished Legal Graph-SOP Workspace.
- Use the Verified Case Demo sidebar entry/card, or open /viewer/case_corpus_demo.html directly, for the source-proofed case-law demo.
- Point to the 120-case sample metrics and the 344 paragraph/proposition/principle card counts.
- Open at least one HKLII/LegalRef paragraph URL with a #p anchor from the demo output.
- State that every supported demo is source-linked research-prototype analysis with professional_advice_certified=false.
- Use the unsupported landlord/rent query to show abstention and wrong-domain control.
- Treat graph/domain views as seed-map research UI unless the source-proofed case demo is opened.
- Do not use the production URL for the boss/VC demo until the production smoke test passes.

## Unsupported Query Abstention

- Unsupported-query abstention rate: 1

## Known Limitations

- The PR remains a draft research/demo preview, not a merged production release.
- The sample is intentionally frozen at 120 targeted criminal-law cases; this run does not scale to 500, 10k or 25k cases.
- All case-law outputs remain in research_prototype mode.
- No machine-generated proposition or principle is professionally certified.
- The three repaired target issues are medium coverage, not broad professionally certified coverage.
- Current treatment, ratio/obiter classification and final legal advice require later professional certification.
- Uploaded evidence handling is text/transcript triage only; OCR/PDF/image/audio/video evidence analysis is not implemented.
- Private/licensed sources, AI candidates and recall-only cases cannot support answer-layer authority.

## Forbidden Claims

- 10k answer-safe propositions
- whole HK legal RAG solved
- production legal advice
- professionally certified current treatment
- automated OCR/PDF/image/audio/video evidence analysis
