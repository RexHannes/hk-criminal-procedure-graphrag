# Case Corpus L1-L3.5 Status

This is a real L1-L3.5 public criminal-law sample corpus with 100 HKLII-verified cases. It is not 10k answer-safe and L4 is not implemented.

| Metric | Value |
|---|---:|
| Registry cases | 100 |
| Paragraphized cases | 100 |
| Paragraph cards | 300 |
| Proposition cards | 300 |
| Principle cards | 300 |
| Case digest cards | 100 |
| Issue-mapped cases | 100 |
| Paragraph anchor pass rate | 1 |
| Quote support pass rate | 1 |
| Checksum pass rate | 1 |
| Answer-safe count | 0 |
| Research-only count | 1100 |
| Lawyer-review-required count | 100 |

## Top Issue Coverage

| Issue | Cases |
|---|---:|
| criminal_law.theft.sentencing | 94 |
| criminal_law.deception | 90 |
| criminal_law.theft | 84 |
| criminal_law.theft.appropriation | 58 |
| criminal_law.fraud | 56 |
| criminal_procedure.interview_caution | 36 |
| criminal_law.dishonesty | 21 |
| criminal_law.theft.dishonesty | 21 |
| criminal_law.theft.mens_rea | 21 |
| criminal_law.theft.handling_stolen_goods | 15 |
| criminal_procedure.bail | 8 |
| criminal_law.theft.belonging_to_another | 2 |

## Cases By Court

| Court | Cases |
|---|---:|
| District Court | 85 |
| Court of Appeal | 8 |
| Court of First Instance | 7 |

## Cases By Year

| Year | Cases |
|---|---:|
| 2020 | 3 |
| 2021 | 25 |
| 2022 | 8 |
| 2023 | 11 |
| 2024 | 20 |
| 2025 | 23 |
| 2026 | 10 |

## Extraction Limitations

- Automated paragraph selection is term-based and conservative.
- Legal propositions and principles remain machine_candidate / research_only.
- Current treatment and ratio/obiter classification are unchecked unless later lawyer-reviewed.
- The sample focuses on theft, dishonesty, deception, fraud and theft-linked procedure; it is not a whole HK criminal-law corpus.

## Next Scale Target

- Expand from this verified sample toward 500 then 10,000 L1/L2 cases only after adding reviewer gates and stronger current-treatment checks.
- Safe claim: Validated L1-L3.5 sample corpus; not a 10k answer-safe corpus.

## Layer Boundary

- L1 registry: implemented for the verified sample.
- L2 paragraph proof: implemented for public HKLII paragraph cards with anchors and checksums.
- L3 proposition/principle extraction: implemented as deterministic research-only machine candidates.
- L3.5 issue-mapped case digest and memo retrieval: implemented for the sample.
- L4 answer-safe review: not implemented.

## Forbidden Claim

Do not describe this sample as 10k answer-safe propositions, whole HK legal RAG, final legal advice, full lawyer-reviewed treatment, or automated media/OCR evidence analysis.

## RAG Pipeline Metrics

| Metric | Value |
|---|---:|
| Total chunks | 1012 |
| Embedded chunks | 1012 |
| Dry-run vectors | 1012 |
| Retrieval eval Precision@5 | 0.925 |
| Retrieval eval Recall@10 | 0.341798 |
| Source proof rate | 1 |
| Wrong-domain leak rate | 0 |
| Unsupported-query abstention rate | 1 |
| Duplicate rate | 0 |
| Failed ingest count | 0 |
| Retryable failure count | 0 |
