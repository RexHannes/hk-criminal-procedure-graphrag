# Principle Quality Repair

Repairs current L1-L3.5 sample principle quality before 500-case scaling; demoted cards are preserved, not deleted.

| Metric | Value |
|---|---:|
| Principle cards | 344 |
| Usable in research answer layer | 97 |
| Demoted / not answer-layer usable | 247 |
| Needs review | 0 |

## Demotion Reasons

| Reason | Count |
|---|---:|
| sentencing_only_not_liability | 187 |
| quote_context_insufficient | 40 |
| background_only_not_principle | 29 |
| procedural_only_not_liability | 25 |

## Boundary

- Demoted cards remain in the principle JSONL for audit lineage.
- Demoted cards are excluded from issue-map principle links and answer-layer principle chunks.
- No card is promoted to answer_safe.
