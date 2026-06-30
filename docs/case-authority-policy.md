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

## Current PR #6 Authority Bridge Counts

The committed case-authority registry currently reports:

- 177 case-like seed records inventoried;
- 458 paragraph-linked public-source authority records;
- 2 product-visible legacy case seed nodes with full paragraph proof: Leung Kwok Hung 2005 and Lam Tat Ming 2000;
- 259 doctrine nodes with attached verified evidence;
- 175 unresolved seed cases excluded from authority UI/backend retrieval;
- 0 visible unverified authorities;
- 0 backend-searchable unverified authorities.

Correct product claim: the viewer and AI Inquiry expose only paragraph-linked public-source authority. Do not say every legacy seed case is verified.

## Product Labels

Use clean visible labels:

- Source-linked;
- Public judgment;
- Paragraph proof;
- Research prototype.

Do not show per-card blocker labels such as `Verification pending`, `Source check pending`, `Human review required`, `Lawyer review required`, `Not answer safe`, `Case audit required`, or `answer_safe=false`.
