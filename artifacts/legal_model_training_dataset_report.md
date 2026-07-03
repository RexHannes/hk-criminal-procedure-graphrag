# Legal Model Training Dataset Report

Generated: 2026-06-30T00:00:00.000Z

## Summary

- Total examples: 789
- Source proof rate: 1
- Quote support rate: 1
- Answer-safe examples: 0
- Private/source-candidate examples: 0
- Unverified teacher examples in SFT: 0
- Unsupported-domain abstention examples: 1

## Examples By Task

| Task | Count |
| --- | --- |
| demotion_classifier | 344 |
| paragraph_to_proposition | 344 |
| proposition_to_principle | 97 |
| retrieved_authorities_to_memo | 4 |

## Split Counts

| Split | Count |
| --- | --- |
| eval | 159 |
| train | 630 |

## Top Issue Coverage

| Issue | Count |
| --- | --- |
| `criminal_law.theft` | 578 |
| `criminal_law.deception` | 446 |
| `criminal_law.theft.sentencing` | 393 |
| `criminal_law.fraud` | 243 |
| `criminal_law.theft.appropriation` | 172 |
| `criminal_law.theft.dishonesty` | 92 |
| `criminal_procedure.interview_caution` | 92 |
| `criminal_law.dishonesty` | 91 |
| `criminal_law.theft.mens_rea` | 91 |
| `criminal_law.theft.handling_stolen_goods` | 75 |
| `criminal_procedure.bail` | 59 |
| `criminal_law.theft.intention_permanently_deprive` | 55 |
| `criminal_law.theft.belonging_to_another` | 46 |

## Limitations

- Dataset is derived from the frozen PR #6 120-case criminal-law sample only.
- No model has been trained in this PR.
- Teacher candidates remain candidate-only unless verified by public paragraph quote/card generation.
- The dataset teaches extraction, classification, demotion and memo drafting behaviour, not final legal advice.
- Current treatment and lawyer-reviewed answer-safe status remain out of scope.

## Recommended Minimum Before LoRA

- 500 verified public cases
- 5,000 verified task examples
- source proof rate = 1
- quote support rate = 1
- answer_safe_count = 0
- private_source_count = 0
