# PR 6 Presentation Status

Generated for the `codex/investor-recall-25k-path` branch after the Part 1 two-vertical source-grounding work.

## Safe Current Claim

PR 6 is a working draft preview for a source-gated legal research demo. It is not a merged production release and it is not a general Hong Kong legal advice engine.

Safe wording:

```text
The PR now demonstrates answer-first, source-gated legal research for two verticals:
probate intestacy distribution and criminal theft/shoplifting/forgot-to-pay.
It keeps unsupported general HK-law questions in an unsupported mode, separates legal
authority from user facts and uploaded evidence, and requires lawyer review before advice.
```

Do not claim:

- general reliable Hong Kong legal RAG across all fields;
- 10k/25k answer-safe propositions;
- uploaded CCTV/image/PDF evidence analysis;
- final legal advice or production shipment.

## Implemented Boundaries

- `demo_supported`: only the two source-gated demo verticals.
- `source_grounded_research_only`: used only where a separate verified bundle/source path exists.
- `unsupported_general_query`: outside supported source-gated scope.
- `answer_safe=false` and `needs_lawyer_review=true` remain mandatory.
- `case_recall_only` cards cannot support final legal propositions.
- Private textbooks, private precedents, client documents and AI-generated candidates are not public answer authority.

## L1-L3.5 Case-Corpus Pipeline

PR 6 now includes a sample public case-law pipeline:

```text
public source -> case registry -> paragraph card -> proposition card -> principle card -> case digest card -> issue-mapped retrieval -> research-only memo
```

Safe claim:

```text
The system demonstrates an L1-L3.5 public case-law pipeline: case registry,
exact paragraph cards, extracted propositions/principles, case digest cards,
issue mapping, and research-only case-law memo retrieval.
```

Actual committed sample: 100 public HKLII criminal-law cases, 300 paragraph cards, 300 proposition cards, 300 principle cards, 100 digest cards, and 100 issue-mapped cases. Important boundary: this is a verified sample corpus, not 10,000 answer-safe propositions. L4 lawyer-reviewed answer-safe promotion is not implemented.

Status dashboard:

```text
artifacts/case_corpus_l1_l35_status.json
artifacts/case_corpus_l1_l35_status.md
```

Detailed pipeline doc:

```text
docs/case-corpus-l1-l35-pipeline.md
```

## Uploaded Evidence Contract

The API accepts text or transcript evidence through JSON fields such as:

- `evidence_text`
- `evidence_items[]`
- `uploaded_evidence[]`
- `documents[]`

Parsed evidence is used only for the `Evidence Analysis` section and `evidence_source_audit`.

It is not legal authority. It does not make any answer `answer_safe`. Binary PDFs, images, audio and video files remain unparsed unless a separate OCR/media layer supplies extracted text.

## Case-Law Coverage Boundary

The theft demo currently uses conservative paragraph-proof cards only where public paragraph text is attached and checked. The expanded criminal-law sample is focused on theft, dishonesty, deception, fraud, theft sentencing and theft-linked procedure. Probate remains statute-first, with no public HKLII/LegalRef probate case paragraph authority attached for the intestacy/minor/statutory-trust scenario unless later verified.

Current issue coverage:

| Issue | Cases |
|---|---:|
| `criminal_law.theft.sentencing` | 94 |
| `criminal_law.deception` | 90 |
| `criminal_law.theft` | 84 |
| `criminal_law.theft.appropriation` | 58 |
| `criminal_law.fraud` | 56 |
| `criminal_procedure.interview_caution` | 36 |
| `criminal_law.theft.dishonesty` | 21 |

Expanding case-law coverage must follow this order:

```text
public source -> paragraph card -> exact quote/proof -> proposition/principle card -> digest -> reviewer promotion
```

Machine candidates remain research-only until human/lawyer review.

## Demo Guidance

Use PR 6 as:

- a source-gated answer-first memo demo;
- a two-vertical Part 1 proof of architecture;
- a guardrailed RAG surface showing unsupported-query abstention;
- a foundation for downstream SOP/forms after legal classification.

Avoid presenting it as:

- production shipped;
- comprehensive HK law;
- broad uploaded-evidence analysis;
- automated lawyer-quality advice.

## Three Demo Scripts

Run these three only. Do not add a third vertical for the demo.

### Demo A - Theft Without Uploaded Evidence

Query:

```text
If I am alleged to be stealing something in the convenience store, but I forgot to pay and security stopped me, what are the AR/MR issues and what facts help or hurt?
```

Expected story:

- product mode: `demo_supported`;
- theft elements, dishonesty and intention permanently to deprive appear before raw graph/debug data;
- Chan/Khan authorities and statute links are clickable;
- the opt-in L1-L3.5 case-corpus memo can return 8 research-only case authorities from the expanded sample;
- `Evidence Analysis` maps helpful and harmful facts but says no uploaded text evidence was supplied;
- audit/retrieval remains collapsed.

### Demo B - Theft With Uploaded Text Evidence

Use the same scenario with an evidence transcript:

```json
{
  "query": "If I am alleged to be stealing something in the convenience store, but I forgot to pay and security stopped me, what are the AR/MR issues and what facts help or hurt?",
  "evidence_text": "CCTV transcript: customer picked up chocolate, kept it visible in hand, paid for a drink at checkout, received a phone call, walked out still holding chocolate, security stopped him outside, he immediately offered to pay."
}
```

Expected story:

- product mode: `demo_supported`;
- `Evidence Analysis` says visible item, payment for another item, distraction and immediate offer to pay help the forgotten-payment account;
- exit/security-stop facts still need explanation;
- evidence is labelled text/transcript research triage only, not legal authority;
- `answer_safe` remains false and lawyer review remains required.

### Demo C - Unsupported General Query

Query:

```text
Can my landlord increase rent for my Hong Kong flat next month?
```

Expected story:

- product mode: `unsupported_general_query`;
- no confident HK landlord/rent answer;
- no final legal proposition is source-grounded;
- the output asks for a supported vertical/source pack before answering.

## Saved Demo Outputs

The current saved memo outputs live under:

```text
artifacts/demo_outputs/
```

Regenerate them from the local API handler with:

```bash
node scripts/generate_pr6_demo_outputs.js
```

Validate the demo assets with:

```bash
node scripts/validate_pr6_demo_assets.js
```

Additional L1-L3.5 case-corpus demo outputs:

```text
artifacts/demo_outputs/theft_case_corpus_l35_answer.md
artifacts/demo_outputs/theft_case_corpus_l35_answer.json
artifacts/demo_outputs/probate_case_corpus_l35_answer.md
artifacts/demo_outputs/unsupported_general_query_l35_answer.md
artifacts/demo_outputs/theft_dishonesty_case_law_table.md
artifacts/demo_outputs/case_corpus_sample_authorities_table.md
```

Regenerate and validate them with:

```bash
node scripts/generate_case_corpus_l35_demo_outputs.js
node scripts/validate_case_corpus_l35_demo_outputs.js
```
