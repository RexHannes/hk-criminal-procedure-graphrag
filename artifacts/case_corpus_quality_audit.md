# Case Corpus Quality Audit

Quality audit over deterministic 20-case random sample plus 10 high-value theft/dishonesty cases in the verified L1-L3.5 criminal-law corpus branch.

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
| Answer-safe count | 0 |
| Current treatment unchecked | 5959 |
| Current treatment checked | 0 |
| Private/licensed source count | 0 |

## Most Common Suspicious Reasons

| Reason | Count |
|---|---:|
| sentencing_only_not_liability | 38 |
| background_only_not_principle | 31 |
| quote_context_insufficient | 21 |
| procedural_only_not_liability | 4 |

## Boundary

- This audit does not promote cards to answer_safe.
- Suspicious and demoted cards remain research_only and should be reviewed before scaling beyond this branch.
- Current treatment remains unchecked unless a lawyer-review gate explicitly changes it.
