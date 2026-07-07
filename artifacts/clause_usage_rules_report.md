# Clause Usage Rules Report

## Demonstrated Clause Behaviour

For a pre-action letter-of-claim scenario with no medical evidence or receipts:

Applicable clause types:

- `BACKGROUND_FACTS`
- `PARTY_DESCRIPTION`
- `LIABILITY_ALLEGATION`
- `SETTLEMENT_PROPOSAL`

Blocked clause types:

- `MEDICAL_EVIDENCE`
- `SPECIAL_DAMAGES`

Block reasons:

- Medical evidence is missing or incomplete; do not finalise this clause.
- Missing required fact: `medicalEvidenceReceived`.
- Special damages evidence is missing; use placeholder and evidence task only.
- Missing required fact: `specialDamagesEvidenceAvailable`.

Provenance labels used:

- `TEMPLATE_BASED`
- `INTERNAL_USAGE_NOTE`
- `FIRM_SOP`
- `AI_SUGGESTED`
