# PR #6 Demo Query Pack

Generated: 2026-06-30T00:00:00.000Z

## Safe Demo Claim

> The system demonstrates a source-linked HK criminal-law case-law research prototype over a targeted 120-case L1-L3.5 sample. It retrieves public case authorities with paragraph anchors, exact quotes, extracted propositions/principles, issue mapping, demotion filtering, and answer-first research memos. It is not professional legal advice; professional certification is a later HITL product step.

## Queries

| ID | Query | Route | Issue | Corpus | Abstain | Answer Mode | Certified |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A | If I forgot to pay at a shop, what are the dishonesty issues? | demo_supported theft/shoplifting answer with case-corpus research attached | `criminal_law.theft.dishonesty` | yes | no | research_prototype | false |
| B | What does intention permanently to deprive mean in theft? | source_grounded_research_only case-corpus memo | `criminal_law.theft.intention_permanently_deprive` | yes | no | research_prototype | false |
| C | How does Hong Kong theft law handle property belonging to another? | source_grounded_research_only case-corpus memo | `criminal_law.theft.belonging_to_another` | yes | no | research_prototype | false |
| D | What bail factors matter in a theft or dishonesty-related case? | source_grounded_research_only case-corpus memo | `criminal_procedure.bail` | yes | no | research_prototype | false |
| E | My landlord increased my rent. What should I do? | unsupported_general_query | none | no | yes | research_prototype | false |

## Source-Proof Expectations

### A. Theft/dishonesty

- Expected source-proof behaviour: Return public case-law research only when paragraph anchors, proposition quote support and usable principle filtering pass.
- Expected answer mode: research_prototype
- Expected professional advice certified: false

### B. Intention permanently to deprive

- Expected source-proof behaviour: Return only paragraph-proofed public cases mapped to intention permanently to deprive or theft.
- Expected answer mode: research_prototype
- Expected professional advice certified: false

### C. Belonging to another

- Expected source-proof behaviour: Return only paragraph-proofed public cases mapped to belonging-to-another or theft.
- Expected answer mode: research_prototype
- Expected professional advice certified: false

### D. Bail

- Expected source-proof behaviour: Return only paragraph-proofed public cases mapped to bail; do not convert bail/procedure material into liability advice.
- Expected answer mode: research_prototype
- Expected professional advice certified: false

### E. Unsupported

- Expected source-proof behaviour: Abstain from criminal-law case-corpus authority and do not cite theft/dishonesty cases.
- Expected answer mode: research_prototype
- Expected professional advice certified: false
