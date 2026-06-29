# Case Corpus Retrieval Evaluation

Research-only L1-L3.5 retrieval evaluation over the 100-case sample corpus.

| Metric | Value |
|---|---:|
| Recall@5 | 0.927273 |
| Recall@10 | 0.954545 |
| Precision@5 | 0.872727 |
| MRR | 0.818182 |
| Issue match rate | 0.881818 |
| Source proof rate | 1 |
| Paragraph quote support rate | 1 |
| Wrong-domain leak rate | 0 |
| Unsupported query abstention rate | 1 |
| Exact citation/name lookup hit rate | 1 |

## Query Results

| Query | R@5 | R@10 | P@5 | MRR | Returned |
|---|---:|---:|---:|---:|---:|
| theft_dishonesty | 0.8 | 0.9 | 0.8 | 0.5 | 10 |
| forgot_to_pay | 0.8 | 0.9 | 0.8 | 0.5 | 10 |
| intention_permanently_deprive | 1 | 1 | 1 | 1 | 10 |
| appropriation | 0.6 | 0.8 | 0.6 | 0.5 | 10 |
| belonging_to_another | 1 | 1 | 0.4 | 0.5 | 10 |
| theft_sentencing | 1 | 1 | 1 | 1 | 10 |
| fraud_dishonesty | 1 | 1 | 1 | 1 | 10 |
| caution_interview | 1 | 1 | 1 | 1 | 10 |
| shoplifting_without_paying | 1 | 1 | 1 | 1 | 10 |
| exact_citation_lookup | 1 | 0.9 | 1 | 1 | 10 |
| case_name_lookup | 1 | 1 | 1 | 1 | 10 |
| unsupported_landlord_rent | 1 | 1 | 1 | 1 | 0 |

## Legacy Whole-Corpus Recall

The previous metric divided top-k hits by every case mapped to a broad issue, which caps common issues such as theft sentencing at 10/94. It is retained as a coverage diagnostic, not as the top-k recall target.

| Query | Legacy R@10 | Relevant cases |
|---|---:|---:|
| theft_dishonesty | 0.42857142857142855 | 21 |
| forgot_to_pay | 0.42857142857142855 | 21 |
| intention_permanently_deprive | 0.11904761904761904 | 84 |
| appropriation | 0.13793103448275862 | 58 |
| belonging_to_another | 1 | 2 |
| theft_sentencing | 0.10638297872340426 | 94 |
| fraud_dishonesty | 0.10638297872340426 | 94 |
| caution_interview | 0.2777777777777778 | 36 |
| shoplifting_without_paying | 0.11904761904761904 | 84 |
| exact_citation_lookup | 0.42857142857142855 | 21 |
| case_name_lookup | 0.10638297872340426 | 94 |

## Boundary

- All retrieved case-corpus results remain research_only / lawyer-review-required.
- The unsupported landlord/rent query must abstain and must not receive theft authority.
- Source proof is required before any case/proposition/principle can appear in the rendered research layer.

