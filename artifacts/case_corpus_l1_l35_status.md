# Case Corpus L1-L3.5 Status

This is a real L1-L3.5 public criminal-law corpus branch with 530 HKLII-verified cases. It is not 10k answer-safe and L4/current-treatment review is not implemented.

| Metric | Value |
|---|---:|
| Registry cases | 530 |
| Paragraphized cases | 530 |
| Paragraph cards | 1633 |
| Proposition cards | 1633 |
| Principle cards | 1633 |
| Case digest cards | 530 |
| Issue-mapped cases | 530 |
| Paragraph anchor pass rate | 1 |
| Quote support pass rate | 1 |
| Checksum pass rate | 1 |
| Answer-safe count | 0 |
| Research-only count | 5959 |
| Lawyer-review-required count | 530 |

## Top Issue Coverage

| Issue | Cases |
|---|---:|
| criminal_law.theft | 507 |
| criminal_law.theft.sentencing | 463 |
| criminal_procedure.interview_caution | 231 |
| criminal_law.theft.appropriation | 213 |
| criminal_law.dishonesty | 138 |
| criminal_law.fraud | 138 |
| criminal_law.theft.dishonesty | 138 |
| criminal_law.theft.mens_rea | 138 |
| criminal_law.deception | 135 |
| criminal_procedure.bail | 81 |
| criminal_law.theft.handling_stolen_goods | 70 |
| criminal_law.theft.belonging_to_another | 15 |

## Cases By Court

| Court | Cases |
|---|---:|
| District Court | 432 |
| Court of Appeal | 52 |
| Court of First Instance | 44 |
| Court of Final Appeal | 2 |

## Cases By Year

| Year | Cases |
|---|---:|
| 2020 | 8 |
| 2021 | 155 |
| 2022 | 72 |
| 2023 | 82 |
| 2024 | 91 |
| 2025 | 80 |
| 2026 | 42 |

## Extraction Limitations

- Automated paragraph selection is term-based and conservative.
- Legal propositions and principles remain machine_candidate / research_only.
- Current treatment and ratio/obiter classification are unchecked unless later lawyer-reviewed.
- The sample focuses on theft, dishonesty, deception, fraud and theft-linked procedure; it is not a whole HK criminal-law corpus.
- 500-case discovery is public-source and term-based; actual count may be below 500 where public source proof is not discovered in this run.
- Current treatment and ratio/obiter classification remain unchecked unless later lawyer-reviewed.
- No answer-safe propositions are created by this scale pass.

## Next Scale Target

- Audit this 500-case branch before any later 1k/10k L1/L2 growth; add reviewer gates and current-treatment checks before answer-safe promotion.
- Safe claim: Validated public-source L1-L3.5 research-only criminal-law corpus; not a 10k answer-safe corpus.

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
| Principle cards | 1633 |
| Usable in research answer layer | 623 |
| Demoted / not answer-layer usable | 1010 |
| Needs review | 0 |

### Demotion Reasons

| Reason | Count |
|---|---:|
| sentencing_only_not_liability | 521 |
| background_only_not_principle | 480 |
| quote_context_insufficient | 334 |
| procedural_only_not_liability | 56 |

## RAG Pipeline Metrics

| Metric | Value |
|---|---:|
| Total chunks | 4433 |
| Embedded chunks | 4433 |
| Dry-run vectors | 4433 |
| Retrieval eval Precision@5 | 0.945455 |
| Retrieval eval Recall@10 | 0.945455 |
| Retrieval legacy corpus Recall@10 | 0.093773 |
| Retrieval Recall@10 improvement vs prior | 0.603657 |
| Source proof rate | 1 |
| Wrong-domain leak rate | 0 |
| Unsupported-query abstention rate | 1 |
| Duplicate rate | 0.016181 |
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
| Audited cases | 30 |
| Paragraph match rate | 1 |
| Quote support match rate | 1 |
| Proposition quality pass rate | 0.957895 |
| Principle quality pass rate | 1 |
| Principle quality pass-rate basis | usable_principles_only_after_repair |
| Usable principles in audit denominator | 32 |
| Digest quality pass rate | 1 |
| Overall quality audit pass rate | 0.991579 |
| Suspicious cards | 67 |
| Rejected or demoted cards | 67 |
| Current treatment unchecked | 5959 |
| Current treatment checked | 0 |
| Private/licensed source count | 0 |

## Issue Coverage Audit

| Issue | Cases | Coverage |
|---|---:|---|
| criminal_law.theft | 507 | demo-credible |
| criminal_law.theft.dishonesty | 138 | demo-credible |
| criminal_law.theft.mens_rea | 138 | demo-credible |
| criminal_law.theft.appropriation | 213 | demo-credible |
| criminal_law.theft.belonging_to_another | 15 | medium |
| criminal_law.theft.intention_permanently_deprive | 12 | medium |
| criminal_law.theft.sentencing | 463 | demo-credible |
| criminal_law.fraud | 138 | demo-credible |
| criminal_law.deception | 135 | demo-credible |
| criminal_procedure.interview_caution | 231 | demo-credible |
| criminal_procedure.bail | 81 | demo-credible |

Weak issue tags: none.
