# Verified 500-Case Regression Report

Local-only regression check for the separate 500-case corpus branch. PR #6 frozen demo artifacts are not rewritten by this report.

| Query | Cases | Paragraph anchors | Exact quotes | Pass |
|---|---:|---:|---:|---|
| theft_dishonesty_research_memo | 5 | 1 | 15 | yes |
| intention_permanently_deprive | 5 | 1 | 15 | yes |
| belonging_to_another | 5 | 1 | 15 | yes |
| bail_theft_dishonesty | 5 | 1 | 15 | yes |
| unsupported_landlord_query | 0 | 1 | 0 | yes |

## Boundaries

- Answer-safe count in regression: 0.
- Wrong-domain leak rate: 0.
- Unsupported query abstention rate: 1.
- All supported outputs remain research_only / lawyer_review_required.

## Query Notes

### theft_dishonesty_research_memo

- Inferred issues: criminal_law.theft.dishonesty, criminal_law.dishonesty, criminal_law.theft.mens_rea, criminal_law.theft.mistake_or_forgot_to_pay, criminal_law.theft.
- Cases returned: 5.
- Errors: none.

### intention_permanently_deprive

- Inferred issues: criminal_law.theft.intention_permanently_deprive.
- Cases returned: 5.
- Errors: none.

### belonging_to_another

- Inferred issues: criminal_law.theft.belonging_to_another.
- Cases returned: 5.
- Errors: none.

### bail_theft_dishonesty

- Inferred issues: criminal_procedure.bail, criminal_law.theft, criminal_law.theft.dishonesty, criminal_law.theft.mens_rea, criminal_law.dishonesty.
- Cases returned: 5.
- Errors: none.

### unsupported_landlord_query

- Inferred issues: none.
- Cases returned: 0.
- Errors: none.
