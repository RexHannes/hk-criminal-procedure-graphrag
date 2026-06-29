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

## Uploaded Evidence Contract

The API accepts text or transcript evidence through JSON fields such as:

- `evidence_text`
- `evidence_items[]`
- `uploaded_evidence[]`
- `documents[]`

Parsed evidence is used only for the `Evidence Analysis` section and `evidence_source_audit`.

It is not legal authority. It does not make any answer `answer_safe`. Binary PDFs, images, audio and video files remain unparsed unless a separate OCR/media layer supplies extracted text.

## Case-Law Coverage Boundary

The theft demo currently uses conservative paragraph-proof cards only where public paragraph text is attached and checked. Probate remains statute-first, with no public HKLII/LegalRef probate case paragraph authority attached for the intestacy/minor/statutory-trust scenario unless later verified.

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
