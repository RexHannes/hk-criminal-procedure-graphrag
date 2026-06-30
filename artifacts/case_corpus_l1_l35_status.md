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

## RAG Pipeline Metrics

| Metric | Value |
|---|---:|
| Total chunks | 918 |
| Embedded chunks | 918 |
| Dry-run vectors | 918 |
| Retrieval eval Precision@5 | 0.945455 |
| Retrieval eval Recall@10 | 0.909091 |
| Retrieval legacy corpus Recall@10 | 0.223482 |
| Retrieval Recall@10 improvement vs prior | 0.567293 |
| Source proof rate | 1 |
| Wrong-domain leak rate | 0 |
| Unsupported-query abstention rate | 1 |
| Duplicate rate | 0 |
| Failed ingest count | 0 |
| Retryable failure count | 0 |

## Candidate Fast-Growth Metrics

NotebookLM, DeepSeek, Claude, GPT and manual outputs are candidate extractors only. HKLII/LegalRef paragraph verification remains the source of truth.

| Metric | Value |
|---|---:|
| Candidate extractions total | 42 |
| Candidates verified | 40 |
| Candidates rejected | 2 |
| Verified cases added | 40 |
| Candidate paragraph cards added | 120 |
| Candidate propositions added | 120 |
| Candidate principles added | 106 |
| Candidate digests added | 40 |
| Candidate cards with demotion flags | 226 |
| Candidate answer-safe count | 0 |

### Candidate Rejection Reasons

| Reason | Count |
|---|---:|
| unsupported_principle | 18 |
| quote_not_found | 3 |
| missing_paragraph | 2 |
| missing_case | 1 |
| private_or_nonpublic_source | 1 |

### Candidate Demotion Reasons

| Reason | Count |
|---|---:|
| current_treatment_unchecked | 40 |
| issue_tag_overbroad | 36 |
| quote_context_insufficient | 25 |
| sentencing_only_not_liability | 25 |
| quote_too_short | 7 |
| background_only_not_principle | 3 |

## Quality Audit Metrics

| Metric | Value |
|---|---:|
| Audited cases | 28 |
| Paragraph match rate | 1 |
| Quote support match rate | 1 |
| Proposition quality pass rate | 0.987805 |
| Principle quality pass rate | 1 |
| Principle quality pass-rate basis | usable_principles_only_after_repair |
| Usable principles in audit denominator | 30 |
| Digest quality pass rate | 1 |
| Overall quality audit pass rate | 0.997561 |
| Suspicious cards | 53 |
| Rejected or demoted cards | 53 |

## Issue Coverage Audit

| Issue | Cases | Coverage |
|---|---:|---|
| criminal_law.theft | 101 | demo-credible |
| criminal_law.theft.dishonesty | 30 | demo-credible |
| criminal_law.theft.mens_rea | 30 | demo-credible |
| criminal_law.theft.appropriation | 63 | demo-credible |
| criminal_law.theft.belonging_to_another | 13 | medium |
| criminal_law.theft.intention_permanently_deprive | 10 | medium |
| criminal_law.theft.sentencing | 94 | demo-credible |
| criminal_law.fraud | 56 | demo-credible |
| criminal_law.deception | 90 | demo-credible |
| criminal_procedure.interview_caution | 37 | demo-credible |
| criminal_procedure.bail | 15 | medium |

Weak issue tags: none.
