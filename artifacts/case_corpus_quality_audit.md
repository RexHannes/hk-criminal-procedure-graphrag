# Case Corpus Quality Audit

Quality audit over deterministic 20-case random sample plus 10 high-value theft/dishonesty cases in the targeted sample; no 500-case scaling.

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

## Most Common Suspicious Reasons

| Reason | Count |
|---|---:|
| sentencing_only_not_liability | 36 |
| background_only_not_principle | 10 |
| quote_context_insufficient | 9 |
| procedural_only_not_liability | 6 |

## Boundary

- This audit does not promote cards to answer_safe.
- Suspicious cards remain research_only and should be reviewed before scaling to 500 cases.
