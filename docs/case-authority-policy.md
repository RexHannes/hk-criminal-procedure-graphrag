# Case Authority Policy

## Current Prototype Rule

Source proof is mandatory. A case may appear in authority UI or AI Inquiry retrieval only when it has:

- a public HKLII, LegalRef or Judiciary judgment URL;
- a paragraph anchor such as `#p17`;
- a paragraph number;
- an exact quote that appears in the paragraph text.

Lawyer review is not a product blocker at this stage. It is quiet HITL metadata for a later certification workflow:

- `lawyer_review_status = "unreviewed"`;
- `answer_mode = "research_prototype"`;
- `professional_advice_certified = false`.

The prototype may retrieve, quote, summarize and apply paragraph-linked public judgments for research analysis. It must exclude unverified seed cases from authority UI and backend retrieval.

## Product Labels

Use clean visible labels:

- Source-linked;
- Public judgment;
- Paragraph proof;
- Research prototype.

Do not show per-card blocker labels such as `Verification pending`, `Source check pending`, `Human review required`, `Lawyer review required`, `Not answer safe`, `Case audit required`, or `answer_safe=false`.
