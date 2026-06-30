# PR #6 Boss/VC Demo Script

## Public Demo Page

For the current unmerged PR, open the Vercel Preview URL recorded in PR #6 and use /viewer/ for the polished Legal Graph-SOP Workspace.

After merge or production promotion, open: https://hk-criminal-procedure-graphrag.vercel.app/viewer/

For the direct verified case-law proof view, open: /viewer/case_corpus_demo.html

Inside the workspace, click the sidebar entry labelled "Verified Case Demo" to open the source-proofed case-law module.

Do not present graph/domain seed-map views as the verified case-law demo. Graph/domain views are seed-map research UI unless the source-proofed Verified Case Demo is opened. They are not the PR #6 paragraph-linked case-law authority view and must not be presented as verified authority.

## Timing

This is a 5-7 minute script for a boss or investor review. Keep the tone simple: this is a careful legal-research demo, not a finished legal-advice product.

## One-Sentence Product Framing

This is a source-proofed Hong Kong criminal-law research assistant that finds public case authorities, shows exact paragraph anchors, and refuses to turn weak or unsupported material into confident legal advice.

## 0:00-0:45 - The Problem

Legal AI often sounds confident even when it has not proved the source. For criminal law, that is dangerous: a factual background paragraph, a sentencing remark, or an unrelated case can be mistaken for a liability rule. This demo is built to show a safer path: every answer starts from public source proof and keeps a clear boundary between research and advice.

## 0:45-1:45 - What The 120-Case Sample Proves

The frozen sample has 120 targeted public Hong Kong criminal-law cases, 344 paragraph cards, 344 proposition cards, and 344 principle cards. The important point is not the count alone. The important point is that weak material is filtered: 97 principles are currently usable for the research layer, while 247 weaker principles are preserved for audit instead of being hidden or used as authority.

## 1:45-2:45 - Why Source Proof Matters

When the system cites a case, it should show a public paragraph URL and an exact quote path. That gives a lawyer or reviewer something concrete to inspect. It also lets the product say no when the source is missing, private, candidate-only, recall-only, or outside the loaded issue map.

## 2:45-3:30 - How Demoted Principles Prevent Hallucination

The system now marks each extracted principle as pass, demoted, or needs review. Sentencing-only material should not become a theft liability rule. Factual background should not become a legal test. Demoted cards stay in the audit trail, but they are filtered out of answer-layer principle chunks and demo authority.

## 3:30-5:15 - Supported Demo Queries

### A. Theft/dishonesty

Ask: "If I forgot to pay at a shop, what are the dishonesty issues?"

Expected explanation: the answer should return a research memo, show case-by-case authorities, include paragraph URLs and exact quote support, and clearly say `answer_safe=false` with lawyer review required.

### B. Intention permanently to deprive

Ask: "What does intention permanently to deprive mean in theft?"

Expected explanation: the answer should return a research memo, show case-by-case authorities, include paragraph URLs and exact quote support, and clearly say `answer_safe=false` with lawyer review required.

### C. Belonging to another

Ask: "How does Hong Kong theft law handle property belonging to another?"

Expected explanation: the answer should return a research memo, show case-by-case authorities, include paragraph URLs and exact quote support, and clearly say `answer_safe=false` with lawyer review required.

### D. Bail

Ask: "What bail factors matter in a theft or dishonesty-related case?"

Expected explanation: the answer should return a research memo, show case-by-case authorities, include paragraph URLs and exact quote support, and clearly say `answer_safe=false` with lawyer review required.

## 5:15-6:00 - Unsupported Query

Ask: "My landlord increased my rent. What should I do?"

Expected explanation: the system should abstain. It should not borrow theft or dishonesty cases for a landlord/rent question. This is a feature, not a failure: it shows wrong-domain leakage is being controlled.

## 6:00-6:45 - How To Explain `answer_safe=false`

`answer_safe=false` means the system is doing legal research triage, not final advice. It can show useful authorities and issue maps, but a lawyer still needs to verify current treatment, ratio/obiter status, the full judgment, and the user's actual evidence before relying on it.

## Next Roadmap

The next step is a separate 500-case scaling PR only after review gates remain green: no wrong-domain leakage, source proof stays at 1.0, unsupported queries abstain, and medium issue tags are strengthened. Do not present this PR as a whole-HK legal RAG or as production legal advice.

## Safe Demo Claim

> The system demonstrates a source-proofed, research-only HK criminal-law case-law assistant over a targeted 120-case L1-L3.5 sample. It retrieves public case authorities with paragraph anchors, extracted propositions/principles, issue mapping, demotion filtering, and answer-first research memos. It is not final legal advice and remains lawyer-review-required.

## Forbidden Claims

- 10k answer-safe propositions
- whole HK legal RAG solved
- production legal advice
- lawyer-reviewed current treatment
- automated OCR/PDF/image/audio/video evidence analysis
