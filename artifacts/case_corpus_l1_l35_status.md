# Case Corpus L1-L3.5 Status

This is a real L1-L3.5 public criminal-law sample corpus with 120 HKLII-verified cases. It is not 10k answer-safe and L4 is not implemented.

| Metric | Value |
|---|---:|
| Registry cases | 120 |
| Paragraphized cases | 120 |
| Paragraph cards | 344 |
| Proposition cards | 344 |
| Principle cards | 344 |
| Case digest cards | 120 |
| Issue-mapped cases | 120 |
| Paragraph anchor pass rate | 1 |
| Quote support pass rate | 1 |
| Checksum pass rate | 1 |
| Answer-safe count | 0 |
| Research-only count | 1272 |
| Lawyer-review-required count | 120 |

## Top Issue Coverage

| Issue | Cases |
|---|---:|
| criminal_law.theft | 101 |
| criminal_law.theft.sentencing | 94 |
| criminal_law.deception | 90 |
| criminal_law.theft.appropriation | 63 |
| criminal_law.fraud | 56 |
| criminal_procedure.interview_caution | 37 |
| criminal_law.dishonesty | 30 |
| criminal_law.theft.dishonesty | 30 |
| criminal_law.theft.mens_rea | 30 |
| criminal_law.theft.handling_stolen_goods | 15 |
| criminal_procedure.bail | 15 |
| criminal_law.theft.belonging_to_another | 13 |

## Cases By Court

| Court | Cases |
|---|---:|
| District Court | 98 |
| Court of Appeal | 11 |
| Court of First Instance | 11 |

## Cases By Year

| Year | Cases |
|---|---:|
| 2020 | 3 |
| 2021 | 28 |
| 2022 | 11 |
| 2023 | 16 |
| 2024 | 25 |
| 2025 | 25 |
| 2026 | 12 |

## Extraction Limitations

- Automated paragraph selection is term-based and conservative.
- Legal propositions and principles remain machine_candidate / research_only.
- Current treatment and ratio/obiter classification are unchecked unless later lawyer-reviewed.
- The sample focuses on theft, dishonesty, deception, fraud and theft-linked procedure; it is not a whole HK criminal-law corpus.
- Targeted weak-issue cases were added only where public HKLII paragraphs contained the weak issue signal.
- This is not a 500-case scale-up; it is a narrow quality/coverage repair pass.

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

## Principle Quality Repair

| Metric | Value |
|---|---:|
| Principle cards | 344 |
| Usable in research answer layer | 97 |
| Demoted / not answer-layer usable | 247 |
| Needs review | 0 |

### Demotion Reasons

| Reason | Count |
|---|---:|
| sentencing_only_not_liability | 187 |
| quote_context_insufficient | 40 |
| background_only_not_principle | 29 |
| procedural_only_not_liability | 25 |
