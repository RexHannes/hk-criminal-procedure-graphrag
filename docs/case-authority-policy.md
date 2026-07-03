# Case Authority Policy

## Product invariant

**Visible or searchable case authority = paragraph-linked public judgment only.**

Every product-facing case record must have:

1. Public source URL (HKLII / LegalRef / Judiciary)
2. Exact paragraph number
3. Exact quote contained in paragraph text
4. Short principle / sub-issue / application summary

Unresolved case seeds are **excluded** from product authority surfaces and listed only in:

- `artifacts/excluded_unverified_case_seeds_report.json`
- `artifacts/excluded_unverified_case_seeds_report.md`

## Status model

```json
{
  "source_status": "paragraph_linked_public_source",
  "research_use_allowed": true,
  "lawyer_review_status": "unreviewed",
  "answer_mode": "research_prototype",
  "professional_advice_certified": false
}
```

## Evaluations

```bash
node scripts/evaluate_case_recall_level1.js
node scripts/evaluate_ai_inquiry_level2.js
node scripts/run_case_authority_pipeline.js
```

Artifacts:

- `artifacts/case_recall_level1_eval.json` / `.md`
- `artifacts/ai_inquiry_level2_eval.json` / `.md`
- `artifacts/case_authority_final_report.json` / `.md`

## Gates

| Gate | Status | Effect |
|------|--------|--------|
| **Source proof** | Mandatory now | Case must have public URL + paragraph + contained quote + summary |
| **Lawyer review** | Later HITL feature | Quiet metadata only; does **not** block retrieval or analysis |

Quiet metadata on all paragraph-linked records:

- `lawyer_review_status = unreviewed`
- `answer_mode = research_prototype`
- `professional_advice_certified = false`

## Product labels

Use on case cards:

- Source-linked
- Public judgment
- Paragraph proof
- Research prototype

Do **not** surface per-card labels such as “Verification pending”, “Human review required”, “Not answer safe”, or “Case audit required”.

## Pipeline

```bash
node scripts/inventory_all_visible_case_seeds.js
node scripts/resolve_all_visible_case_sources.js
node scripts/build_viewer_evidence_index.js
node scripts/validate_verified_case_authority.js
node scripts/generate_case_authority_final_report.js
```

Or:

```bash
node scripts/run_case_authority_pipeline.js
```

## Core modules

| Module | Role |
|--------|------|
| `src/case_graph/verified_case_authority.js` | Source-proof verification, inventory, index build |
| `src/case_graph/research_prototype_metadata.js` | Quiet lawyer-review metadata |
| `data/legal_ingest/case_corpus/viewer_evidence_index.json` | Paragraph-linked evidence for viewer + API |
| `api/doctrine-evidence.js` | Inspector — paragraph-linked evidence only |
| `api/search-evidence.js` | AI Inquiry — retrieves, quotes, applies paragraph-linked cases |

## Do not

- Show unverified case seeds as authorities in the viewer
- Block AI Inquiry or analysis for lack of lawyer review when paragraph proof exists
- Use `answer_safe` or `lawyer_review_required` as prototype gates
- Invent links or paragraph numbers
- Replace the original viewer with iframe / standalone proof pages

## CI

`scripts/validate_verified_case_authority.js` fails unless every inventoried case seed is verified or excluded, and the viewer filters unverified seeds.
