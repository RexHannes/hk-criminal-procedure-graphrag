# Case Corpus Retrieval Evaluation

Research-only L1-L3.5 retrieval evaluation over the 100-case sample corpus.

| Metric | Value |
|---|---:|
| Recall@5 | 0.945455 |
| Recall@10 | 0.909091 |
| Precision@5 | 0.945455 |
| MRR | 1 |
| Issue match rate | 0.909091 |
| Source proof rate | 1 |
| Paragraph quote support rate | 1 |
| Wrong-domain leak rate | 0 |
| Unsupported query abstention rate | 1 |
| Exact citation/name lookup hit rate | 1 |

## Query Results

| Query | R@5 | R@10 | P@5 | MRR | Returned |
|---|---:|---:|---:|---:|---:|
| theft_dishonesty | 0.8 | 0.9 | 0.8 | 1 | 10 |
| forgot_to_pay | 0.8 | 0.9 | 0.8 | 1 | 10 |
| intention_permanently_deprive | 1 | 0.7 | 1 | 1 | 10 |
| appropriation | 0.8 | 0.7 | 0.8 | 1 | 10 |
| belonging_to_another | 1 | 0.9 | 1 | 1 | 10 |
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
| theft_dishonesty | 0.3 | 30 |
| forgot_to_pay | 0.3 | 30 |
| intention_permanently_deprive | 0.06930693069306931 | 101 |
| appropriation | 0.1111111111111111 | 63 |
| belonging_to_another | 0.6923076923076923 | 13 |
| theft_sentencing | 0.10638297872340426 | 94 |
| fraud_dishonesty | 0.10638297872340426 | 94 |
| caution_interview | 0.2702702702702703 | 37 |
| shoplifting_without_paying | 0.09615384615384616 | 104 |
| exact_citation_lookup | 0.3 | 30 |
| case_name_lookup | 0.10638297872340426 | 94 |

## Boundary

- All retrieved case-corpus results remain research_only / lawyer-review-required.
- The unsupported landlord/rent query must abstain and must not receive theft authority.
- Source proof is required before any case/proposition/principle can appear in the rendered research layer.

