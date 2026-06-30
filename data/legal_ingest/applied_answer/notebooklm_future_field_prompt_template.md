# NotebookLM Future Field Prompt Template

Use this only after the existing domain tree has been searched and no clean branch fits.

NotebookLM output is candidate metadata only. It is not authority, not legal advice, and cannot become answer-safe without public source verification.

```text
Dear NotebookLM, please propose a candidate Hong Kong law applied-answer structure for:

Field / branch:
<FIELD_OR_BRANCH>

User problem pattern:
<FACT_PATTERN_OR_QUERY_FAMILY>

Existing tree gap:
<WHY_EXISTING_DOCTRINE_NODE_IDS_ARE_INSUFFICIENT>

Please return compact JSON-like metadata only:
1. domain_id suggestion
2. branch / issue taxonomy
3. routing keywords and exclusion keywords
4. structured fact schema for user questions
5. decisive facts that change the legal outcome
6. statutory anchors to verify from official public sources
7. candidate landmark cases and lineage, with uncertainty notes
8. source-card requirements for each legal proposition
9. verifier checks: must-include points and forbidden wrong-route answers
10. missing-fact questions that should be asked or surfaced

Do not write final legal advice.
Do not quote private source text.
Treat all cases/citations as candidate leads requiring LegalRef/HKLII/Judiciary verification.
```

Post-processing sequence:

```text
NotebookLM candidate structure
-> public source lookup
-> paragraph/source card extraction
-> exact quote/source validation
-> rule deck and answer contract
-> applied analyzer
-> verifier and golden query tests
-> machine_candidate only until human review
```
