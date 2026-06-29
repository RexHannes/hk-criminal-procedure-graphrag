# Unsupported General Query L1-L3.5 Boundary Memo

## Product Mode

- Mode: `unsupported_general_query`
- Answer safe: `false`
- Lawyer review required: `true`

## Case-Corpus Research

# Unsupported Case-Corpus Research Query

## Short Answer
- This query is outside the two source-gated demo verticals unless a separate verified vertical bundle is loaded.

## Issues
- The query is outside the current sample case-corpus issue map, or the relevant vertical remains statute-first.

## Governing Law / Elements
- No case-corpus governing law is asserted.

## Case-by-Case Authorities
- No case-by-case authority is attached in the sample L1-L3.5 corpus.

## Extracted Legal Principles
- No extracted case principle is available for this query.

## Application to User Facts
- No case-law application is made because the sample corpus has no mapped authority for this query.

## Evidence Analysis
- No uploaded evidence text was supplied for this case-corpus memo. User facts remain separate from legal authority.

## Missing Facts
- Supported issue id, paragraph proof, proposition/principle extraction and lawyer review.

## Practical Next Steps
- Build or load a source-grounded vertical pack before answering.
- Do not cite case law as authority without paragraph cards and exact quote support.

## Source Audit
- L1 registry cases: 100
- L2 paragraph cards: 300
- L3 propositions/principles: 600
- L3.5 digests returned: 0
- L4 answer-safe propositions: not implemented.
- All case-corpus outputs are research_only / lawyer_review_required.

## Full Answer Markdown

# Unsupported General Query - Source Verification Required

## Short Answer
This query is outside the currently source-gated demo verticals unless a separate verified vertical bundle is loaded. Treat this as unsupported general research orientation only, not final HK legal advice.

## Issues
- The legal issue, field, procedural posture and relief have not been source-grounded by a registered vertical pack.

## Governing Law / Elements
- No governing law or element test is treated as established for this unsupported query.

## Relevant Authorities
- No verified statute, public judgment or practice-direction source card is attached for this unsupported query.

## Case-by-Case Authorities
- No case-by-case authority is attached; do not cite case law until paragraph cards and digest cards are verified.

## Extracted Legal Principles
- No extracted legal principle is answer authority for this unsupported query.

## Application to User Facts
- The user's facts should be mapped to issues only after a supported vertical exists. At present, any application would be speculative.

## Evidence Analysis
- No uploaded evidence has been parsed. Keep user facts, document evidence, legal authorities and AI inference separate.

## Missing Facts
- Supported field/vertical, procedural posture, relevant documents, official sources, paragraph proof and lawyer review status.

## Practical Next Steps
- Route the query to a supported vertical or create a source-grounded vertical pack before answering.
- Add official source cards, paragraph cards where cases are used, issue tags and golden queries before final advice.

## Source Audit
- Product mode: unsupported_general_query.
- No final legal proposition is source-grounded by this response.
- Forms and SOPs are downstream and are not recommended for this unsupported query.

## Documents / Forms
- No document pack is recommended for this unsupported query.

---

# Unsupported Case-Corpus Research Query

## Short Answer
- This query is outside the two source-gated demo verticals unless a separate verified vertical bundle is loaded.

## Issues
- The query is outside the current sample case-corpus issue map, or the relevant vertical remains statute-first.

## Governing Law / Elements
- No case-corpus governing law is asserted.

## Case-by-Case Authorities
- No case-by-case authority is attached in the sample L1-L3.5 corpus.

## Extracted Legal Principles
- No extracted case principle is available for this query.

## Application to User Facts
- No case-law application is made because the sample corpus has no mapped authority for this query.

## Evidence Analysis
- No uploaded evidence text was supplied for this case-corpus memo. User facts remain separate from legal authority.

## Missing Facts
- Supported issue id, paragraph proof, proposition/principle extraction and lawyer review.

## Practical Next Steps
- Build or load a source-grounded vertical pack before answering.
- Do not cite case law as authority without paragraph cards and exact quote support.

## Source Audit
- L1 registry cases: 100
- L2 paragraph cards: 300
- L3 propositions/principles: 600
- L3.5 digests returned: 0
- L4 answer-safe propositions: not implemented.
- All case-corpus outputs are research_only / lawyer_review_required.

## Request

```json
{
  "query": "Can my landlord increase rent for my Hong Kong flat next month?",
  "use_case_corpus": true,
  "case_corpus_mode": "sample",
  "max_cases": 3,
  "max_paragraphs": 4
}
```

