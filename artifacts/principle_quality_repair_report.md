# Principle Quality Repair

Repairs current L1-L3.5 sample principle quality before 500-case scaling; demoted cards are preserved, not deleted.

| Metric | Value |
|---|---:|
| Principle cards | 1633 |
| Usable in research answer layer | 623 |
| Demoted / not answer-layer usable | 1010 |
| Needs review | 0 |

## Demotion Reasons

| Reason | Count |
|---|---:|
| sentencing_only_not_liability | 521 |
| background_only_not_principle | 480 |
| quote_context_insufficient | 334 |
| procedural_only_not_liability | 56 |

## Boundary

- Demoted cards remain in the principle JSONL for audit lineage.
- Demoted cards are excluded from issue-map principle links and answer-layer principle chunks.
- No card is promoted to answer_safe.
