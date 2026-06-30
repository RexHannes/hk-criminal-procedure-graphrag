# PR #6 Demo Query Pack

Generated: 2026-06-30T00:00:00.000Z

## Safe Demo Claim

> The system demonstrates a source-proofed, research-only HK criminal-law case-law assistant over a targeted 120-case L1-L3.5 sample. It retrieves public case authorities with paragraph anchors, extracted propositions/principles, issue mapping, demotion filtering, and answer-first research memos. It is not final legal advice and remains lawyer-review-required.

## Queries

| ID | Query | Route | Issue | Corpus | Abstain | Answer Safe |
| --- | --- | --- | --- | --- | --- | --- |
| A | If I forgot to pay at a shop, what are the dishonesty issues? | demo_supported theft/shoplifting answer with case-corpus research attached | `criminal_law.theft.dishonesty` | yes | no | false |
| B | What does intention permanently to deprive mean in theft? | source_grounded_research_only case-corpus memo | `criminal_law.theft.intention_permanently_deprive` | yes | no | false |
| C | How does Hong Kong theft law handle property belonging to another? | source_grounded_research_only case-corpus memo | `criminal_law.theft.belonging_to_another` | yes | no | false |
| D | What bail factors matter in a theft or dishonesty-related case? | source_grounded_research_only case-corpus memo | `criminal_procedure.bail` | yes | no | false |
| E | My landlord increased my rent. What should I do? | unsupported_general_query | none | no | yes | false |

## Source-Proof Expectations

### A. Theft/dishonesty

- Expected source-proof behaviour: Return public case-law research only when paragraph anchors, proposition quote support and usable principle filtering pass.
- Expected needs lawyer review: true

### B. Intention permanently to deprive

- Expected source-proof behaviour: Return only paragraph-proofed public cases mapped to intention permanently to deprive or theft.
- Expected needs lawyer review: true

### C. Belonging to another

- Expected source-proof behaviour: Return only paragraph-proofed public cases mapped to belonging-to-another or theft.
- Expected needs lawyer review: true

### D. Bail

- Expected source-proof behaviour: Return only paragraph-proofed public cases mapped to bail; do not convert bail/procedure material into liability advice.
- Expected needs lawyer review: true

### E. Unsupported

- Expected source-proof behaviour: Abstain from criminal-law case-corpus authority and do not cite theft/dishonesty cases.
- Expected needs lawyer review: true
