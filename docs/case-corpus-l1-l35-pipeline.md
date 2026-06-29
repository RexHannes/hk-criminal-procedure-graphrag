# Case Corpus L1-L3.5 Pipeline

This PR adds a public, research-only case-law pipeline for the HK legal RAG demo. It is deliberately scoped to a verified sample corpus. It does not claim 10k answer-safe propositions or whole-system HK legal advice.

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

The committed sample uses public HKLII paragraph proof for:

- `HKSAR v Chan Kam Ching [2022] HKCFA 7`
- `HKSAR v Khan, Altaf [2022] HKCFI 1220`

The theft/shoplifting demo can retrieve those cases as research-only case authorities. Probate remains statute-first unless public probate paragraph authority is later verified.

## API Usage

`/api/search-evidence` supports the following opt-in request fields:

```json
{
  "query": "If I forgot to pay at a shop, what are the dishonesty issues?",
  "use_case_corpus": true,
  "case_corpus_mode": "sample",
  "issue_id": "criminal_law.theft.dishonesty",
  "max_cases": 3,
  "max_paragraphs": 4
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
node scripts/validate_hklii_paragraph_accuracy.js --sample-size 50
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

These reports distinguish:

- L1 registry;
- L2 paragraph proof;
- L3 proposition/principle extraction;
- L3.5 case digest + issue-mapped research memo;
- L4 not implemented.

## Forbidden Claims

Do not claim:

- 10k answer-safe propositions;
- whole HK legal RAG solved;
- automated final legal advice;
- full lawyer-reviewed case treatment;
- uploaded media/OCR analysis;
- probate case authority unless public paragraph proof is attached.
