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
| Principle candidates | 120 |
| Digest candidates | 40 |
| Answer-safe cards | 0 |

## Rejection Reasons

| Reason | Count |
|---|---:|
| unsupported_principle | 4 |
| quote_not_found | 3 |
| missing_paragraph | 2 |
| missing_case | 1 |
| private_or_nonpublic_source | 1 |

## Boundary

- Candidate output is never authority by itself.
- A proposition needs a verified paragraph and exact quote support.
- A principle needs a verified proposition and paragraph.
- All generated cards remain research_only / machine_candidate or lawyer_review_required.
- L4 answer-safe promotion is not implemented here.
