# Case Corpus L1-L3.5 Pipeline

This PR adds a public, research-only case-law pipeline for the HK legal RAG demo. It is deliberately scoped to a verified criminal-law sample corpus. It does not claim 10k answer-safe propositions or whole-system HK legal advice.

## Safe Claim

The system now demonstrates an L1-L3.5 public case-law pipeline:

```text
public source
  -> case registry
  -> paragraph card
  -> proposition card
  -> principle card
  -> case digest card
  -> issue-mapped retrieval
  -> research-only case-law memo
```

All outputs remain `research_only` / `lawyer_review_required` unless separately reviewed.

## Layer Definitions

| Layer | Implemented artifact | Status |
|---|---|---|
| L1 | `case_registry_10000.jsonl`, `sample_case_registry_100.jsonl` | sample registry committed |
| L2 | `paragraph_cards_sample_100.jsonl` | exact public paragraph anchors + checksums |
| L3 | `proposition_cards_sample_100.jsonl`, `principle_cards_sample_100.jsonl` | deterministic machine candidates with quote support |
| L3.5 | `case_digest_cards_sample_100.jsonl`, `issue_case_map_sample_100.jsonl`, case-law memo retrieval | research-only case-by-case analysis |
| L4 | lawyer-reviewed answer-safe promotion | not implemented |

## Current Sample Coverage

The committed sample now uses public HKLII paragraph proof for:

- 100 public criminal-law cases;
- 300 paragraph cards with exact HKLII `#p` anchors and checksums;
- 300 paragraph-backed proposition cards;
- 300 principle cards;
- 100 L3.5 case digest cards;
- 100 issue-mapped cases.

Coverage is focused on theft, dishonesty, deception, fraud, theft sentencing and theft-linked procedure. The top issue coverage is theft sentencing (94 cases), deception (90), theft (84), theft appropriation (58), fraud (56), interview/caution (36), and dishonesty/theft dishonesty (21). Probate remains statute-first unless public probate paragraph authority is later verified.

The committed source artifact is:

```text
data/legal_ingest/case_corpus/criminal_sample_source_cases.json
```

## API Usage

`/api/search-evidence` supports the following opt-in request fields:

```json
{
  "query": "If I forgot to pay at a shop, what are the dishonesty issues?",
  "use_case_corpus": true,
  "case_corpus_mode": "sample",
  "issue_id": "criminal_law.theft.dishonesty",
  "max_cases": 8,
  "max_paragraphs": 12
}
```

The response still places `legal_research_answer` and `answer_markdown` before audit/debug material. When enabled, it also includes:

- `case_law_research`
- `audit_trail.case_corpus_audit`
- `audit_trail.paragraph_proof_audit`

No case-corpus output is answer-safe.

## Commands

```bash
node scripts/build_case_corpus_l1_l35_sample.js
node scripts/validate_case_registry_10000.js --sample
node scripts/validate_hklii_paragraph_accuracy.js --full
node scripts/validate_proposition_cards.js --sample
node scripts/validate_principle_cards.js --sample
node scripts/validate_case_digest_cards.js --sample
node scripts/validate_case_corpus_l1_l35_status.js
node scripts/index_case_corpus_qdrant.js --dry-run --sample
node scripts/generate_case_corpus_l35_demo_outputs.js
node scripts/validate_case_corpus_l35_demo_outputs.js
```

## Status Dashboard

The current metrics are generated at:

- `artifacts/case_corpus_l1_l35_status.json`
- `artifacts/case_corpus_l1_l35_status.md`

These reports distinguish actual counts and coverage:

- L1 registry;
- L2 paragraph proof;
- L3 proposition/principle extraction;
- L3.5 case digest + issue-mapped research memo;
- L4 not implemented.

The safe wording is:

```text
The system has a validated L1-L3.5 case-law pipeline and a real public criminal-law sample corpus. Current sample size is 100 cases, 300 paragraph cards, 300 propositions, 300 principles, and 100 digests. It remains research-only and lawyer-review-required.
```

## Forbidden Claims

Do not claim:

- 10k answer-safe propositions;
- whole HK legal RAG solved;
- automated final legal advice;
- full lawyer-reviewed case treatment;
- uploaded media/OCR analysis;
- probate case authority unless public paragraph proof is attached.
