# Private Form Ingestion Dry Run Report

Generated: 2026-07-07T03:05:10.081Z

## Privacy Boundary

- Private ZIPs/forms are read only from `private_uploads/`.
- Extracted private text is written only to gitignored `private_ingest_output/`.
- NotebookLM/internal notes are read only from gitignored `private_notebooklm_notes/`.
- This committed report contains metadata only: counts, distributions, warnings, and review-gate state.
- Candidate titles are redacted by default unless `--include-safe-titles` is used locally.
- No private content is sent to external services.

## Summary

| Metric | Value |
|---|---:|
| Packs processed | 5 |
| Templates detected | 27 |
| Clauses detected | 1150 |
| NotebookLM notes linked | 0 |
| Classification reviews created | 27 |
| Templates inactive until review | yes |
| Manual classification required | 100% |
| Extraction warnings | 3 |
| Rejected/suspicious files | 0 |

## Pack Results

### pack_84b47a6be343

- Private output: `private_ingest_output/companies_general_commentary`
- Files: 9
- File types: .docx: 9
- Templates: 9
- Clauses: 540
- Notes linked: 0
- Review queue: 9
- Intent distribution: COMPANY_COMPLIANCE_MEMO: 6, COMPANY_WINDING_UP_PETITION: 1, ORIGINATING_SUMMONS: 1, REGULATORY_COMPLIANCE_NOTE: 1
- Stage distribution: COMPANY_COMPLIANCE: 6, COMPANY_WINDING_UP: 1, COMMENCEMENT: 1, REGULATORY_COMPLIANCE: 1
- Extraction warnings: 0
- Templates inactive until review: yes

### pack_f573e9dc6a08

- Private output: `private_ingest_output/frp_topic_2_export`
- Files: 3
- File types: .pdf: 2, .pptx: 1
- Templates: 2
- Clauses: 0
- Notes linked: 0
- Review queue: 2
- Intent distribution: REGULATORY_COMPLIANCE_NOTE: 2
- Stage distribution: REGULATORY_COMPLIANCE: 2
- Extraction warnings: 2
- Templates inactive until review: yes

### pack_a0032a628333

- Private output: `private_ingest_output/commercial_contracts`
- Files: 6
- File types: .doc: 5, .pdf: 1
- Templates: 6
- Clauses: 276
- Notes linked: 0
- Review queue: 6
- Intent distribution: SHAREHOLDERS_AGREEMENT: 1, LEASE_AGREEMENT: 1, CONTRACT_CLAUSE: 3, CONTRACT_AGREEMENT: 1
- Stage distribution: TRANSACTIONAL_DRAFTING: 6
- Extraction warnings: 1
- Templates inactive until review: yes

### pack_ec3ec6665203

- Private output: `private_ingest_output/company_corporate`
- Files: 4
- File types: .docx: 4
- Templates: 4
- Clauses: 322
- Notes linked: 0
- Review queue: 4
- Intent distribution: COMPANY_COMPLIANCE_MEMO: 1, COMPANY_WINDING_UP_PETITION: 3
- Stage distribution: COMPANY_COMPLIANCE: 1, COMPANY_WINDING_UP: 3
- Extraction warnings: 0
- Templates inactive until review: yes

### pack_795af8bde17d

- Private output: `private_ingest_output/probate_forms`
- Files: 6
- File types: .doc: 6
- Templates: 6
- Clauses: 12
- Notes linked: 0
- Review queue: 6
- Intent distribution: PROBATE_APPLICATION: 2, PROBATE_AFFIDAVIT: 4
- Stage distribution: PROBATE_APPLICATION: 2, EVIDENCE_COLLECTION: 4
- Extraction warnings: 0
- Templates inactive until review: yes


## Recommended Manual Review Actions

- Open the gitignored classification review JSON under private_ingest_output/.
- Review practice area, document intent, procedural stage, prerequisites, and contraindications.
- Approve only one small practice-lane subset first, such as PI, company winding-up, contracts, or probate.
- Keep rejected and uncertain templates inactive in routing.
- Re-run adversarial routing tests after any approval.

## Remaining Limitations

- DOC/PDF extraction quality depends on local command-line tools and source formatting.
- Regex/keyword classifications are not lawyer-approved.
- Real/private templates must remain inactive until classification review is completed.
- Production private store mapping and reviewer permissions are not configured by this dry run.
