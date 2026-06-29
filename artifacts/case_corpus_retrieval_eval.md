# Case Corpus Retrieval Evaluation

Research-only L1-L3.5 retrieval evaluation over the 100-case sample corpus.

| Metric | Value |
|---|---:|
| Recall@5 | 0.233399 |
| Recall@10 | 0.341798 |
| Precision@5 | 0.925 |
| MRR | 1 |
| Issue match rate | 0.9 |
| Source proof rate | 1 |
| Paragraph quote support rate | 1 |
| Wrong-domain leak rate | 0 |
| Unsupported query abstention rate | 1 |

## Query Results

| Query | R@5 | R@10 | P@5 | MRR | Returned |
|---|---:|---:|---:|---:|---:|
| theft_dishonesty | 0.23809523809523808 | 0.47619047619047616 | 1 | 1 | 10 |
| forgot_to_pay | 0.23809523809523808 | 0.47619047619047616 | 1 | 1 | 10 |
| intention_permanently_deprive | 0.05952380952380952 | 0.11904761904761904 | 1 | 1 | 10 |
| appropriation | 0.08620689655172414 | 0.1724137931034483 | 1 | 1 | 10 |
| belonging_to_another | 1 | 1 | 0.4 | 1 | 10 |
| theft_sentencing | 0.05319148936170213 | 0.10638297872340426 | 1 | 1 | 10 |
| fraud_dishonesty | 0.05319148936170213 | 0.10638297872340426 | 1 | 1 | 10 |
| caution_interview | 0.1388888888888889 | 0.2777777777777778 | 1 | 1 | 10 |
| unsupported_landlord_rent | 1 | 1 | 1 | 1 | 0 |

## Boundary

- All retrieved case-corpus results remain research_only / lawyer-review-required.
- The unsupported landlord/rent query must abstain and must not receive theft authority.
- Source proof is required before any case/proposition/principle can appear in the rendered research layer.

