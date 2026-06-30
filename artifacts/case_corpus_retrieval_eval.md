# Case Corpus Retrieval Evaluation

Research-only L1-L3.5 retrieval evaluation over the 100-case sample corpus.

| Metric | Value |
|---|---:|
| Recall@5 | 0.945455 |
| Recall@10 | 0.945455 |
| Precision@5 | 0.945455 |
| MRR | 1 |
| Issue match rate | 0.945455 |
| Source proof rate | 1 |
| Paragraph quote support rate | 1 |
| Wrong-domain leak rate | 0 |
| Unsupported query abstention rate | 1 |
| Exact citation/name lookup hit rate | 1 |

## Query Results

| Query | R@5 | R@10 | P@5 | MRR | Returned |
|---|---:|---:|---:|---:|---:|
| theft_dishonesty | 1 | 1 | 1 | 1 | 10 |
| forgot_to_pay | 1 | 1 | 1 | 1 | 10 |
| intention_permanently_deprive | 1 | 1 | 1 | 1 | 10 |
| appropriation | 1 | 1 | 1 | 1 | 10 |
| belonging_to_another | 1 | 1 | 1 | 1 | 10 |
| theft_sentencing | 1 | 1 | 1 | 1 | 10 |
| fraud_dishonesty | 1 | 0.9 | 1 | 1 | 10 |
| caution_interview | 0.4 | 0.5 | 0.4 | 1 | 10 |
| shoplifting_without_paying | 1 | 1 | 1 | 1 | 10 |
| exact_citation_lookup | 1 | 1 | 1 | 1 | 10 |
| case_name_lookup | 1 | 1 | 1 | 1 | 10 |
| unsupported_landlord_rent | 1 | 1 | 1 | 1 | 0 |

## Legacy Whole-Corpus Recall

The previous metric divided top-k hits by every case mapped to a broad issue, which caps common issues such as theft sentencing at 10/94. It is retained as a coverage diagnostic, not as the top-k recall target.

| Query | Legacy R@10 | Relevant cases |
|---|---:|---:|
| theft_dishonesty | 0.07246376811594203 | 138 |
| forgot_to_pay | 0.0196078431372549 | 510 |
| intention_permanently_deprive | 0.01972386587771203 | 507 |
| appropriation | 0.046948356807511735 | 213 |
| belonging_to_another | 0.6666666666666666 | 15 |
| theft_sentencing | 0.02159827213822894 | 463 |
| fraud_dishonesty | 0.04918032786885246 | 183 |
| caution_interview | 0.021645021645021644 | 231 |
| shoplifting_without_paying | 0.0196078431372549 | 510 |
| exact_citation_lookup | 0.07246376811594203 | 138 |
| case_name_lookup | 0.02159827213822894 | 463 |

## Boundary

- All retrieved case-corpus results remain research_only / lawyer-review-required.
- The unsupported landlord/rent query must abstain and must not receive theft authority.
- Source proof is required before any case/proposition/principle can appear in the rendered research layer.

