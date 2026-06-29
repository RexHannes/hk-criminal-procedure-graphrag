# Candidate Extraction Verification

NotebookLM, DeepSeek, Claude, GPT and manual notes are candidate extractors only. HKLII/LegalRef paragraph proof is the authority source.

| Metric | Value |
|---|---:|
| Candidate extractions | 42 |
| Candidates verified | 40 |
| Candidates rejected | 2 |
| Verified cases | 40 |
| Verified paragraph cards | 120 |
| Proposition candidates | 120 |
| Principle candidates | 106 |
| Digest candidates | 40 |
| Cards with demotion flags | 226 |
| Answer-safe cards | 0 |

## Rejection Reasons

| Reason | Count |
|---|---:|
| unsupported_principle | 18 |
| quote_not_found | 3 |
| missing_paragraph | 2 |
| missing_case | 1 |
| private_or_nonpublic_source | 1 |

## Demotion Categories

| Reason | Count |
|---|---:|
| current_treatment_unchecked | 40 |
| issue_tag_overbroad | 36 |
| quote_context_insufficient | 25 |
| sentencing_only_not_liability | 25 |
| quote_too_short | 7 |
| background_only_not_principle | 3 |

## Boundary

- Candidate output is never authority by itself.
- A proposition needs a verified paragraph and exact quote support.
- A principle needs a verified proposition and paragraph.
- All generated cards remain research_only / machine_candidate or lawyer_review_required.
- L4 answer-safe promotion is not implemented here.
