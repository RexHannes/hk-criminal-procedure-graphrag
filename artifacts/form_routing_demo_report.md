# Form Routing Demo Report

## Initial Scenario

Matter: road traffic PI claim, injury exists, opponent unknown, no police report, medical evidence incomplete, proceedings not commenced.

Recommended:

- `POLICE_REPORT_REQUEST`
- `MEDICAL_RECORDS_REQUEST`

Blockers:

- `medicalEvidenceReceived`
- `MEDICAL_EVIDENCE`

## Pre-Action Ready Scenario

Matter: opponent identified, medical record received, proceedings not commenced.

Recommended:

- `LETTER_OF_CLAIM`

## Proceedings Already Commenced

Blocked:

- `WRIT`

Alternatives:

- `AMENDED_PLEADING`
- `SUMMONS`
- `CONSENT_ORDER`

Routing rule: commencement forms are blocked when `proceedingsCommenced = true`.
