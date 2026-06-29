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

## Ingestion, Chunking, Embedding, Vectorization and Ranking

This pass adds the retrieval plumbing around the 100-case sample without changing the legal safety boundary. The pipeline is idempotent and network-disabled in CI:

```text
ingest queue
  -> public source fetch cache manifest
  -> paragraph/proposition/principle/digest cards
  -> paragraph-preserving chunks
  -> local-hash 2048-dimension embedding dry run
  -> Qdrant payload dry run
  -> hybrid retrieval evaluation
  -> source-proof filtering
```

Paragraph chunks preserve exact HKLII paragraph identity. The chunker does not split a verified paragraph unless it emits a warning, because paragraph integrity is what makes source audit and quote proof possible. Separate proposition, principle, digest and issue-cluster chunks are generated so the retriever can search different legal layers without treating them as the same authority class.

The dry-run embedding path uses deterministic local hash vectors, not OpenRouter paid embeddings. The Qdrant dry run writes payloads shaped for a future online collection, with `source_kind`, `case_id`, `paragraph_id`, `proposition_id`, `issue_tags`, `answer_layer_status`, `review_status`, `court_level` and authority metadata. Live Qdrant writes remain opt-in and are blocked in CI.

Ranking is hybrid. Exact issue tags, citation/name hits, keyword overlap, court authority, paragraph verification, issue role, treatment labels and penalty-topic signals are applied before semantic similarity can dominate. This is deliberate: semantic search alone is too loose for legal RAG because it can retrieve plausible but unsupported or wrong-domain material.

Every returned authority must pass the source-proof filter:

- paragraph cards need a public source URL, exact paragraph anchor and checksum;
- proposition cards need an exact quote supported by a verified paragraph card;
- principle cards need supported proposition and paragraph proof;
- recall-only, private-source, unsupported, or cross-domain material is excluded from the answer layer.

All corpus outputs remain `research_only` and `lawyer_review_required`. L4 answer-safe promotion is not implemented.

## Fast Candidate-Growth Workflow

This PR also adds the faster growth path for NotebookLM, DeepSeek, Claude, GPT or manual notes:

```text
candidate extraction
  -> public HKLII/LegalRef paragraph verification
  -> verified paragraph/proposition/principle/digest cards
  -> validators
  -> research-only retrieval
```

The candidate extractor is never authority. Its job is to propose issue tags, principles, key paragraphs, summaries and quotes. The verifier accepts only candidates whose case identity, public source URL, paragraph anchor and quote support match the committed HKLII paragraph cards. Unsupported, private-source, missing-paragraph and quote-not-found candidates go to the rejected report.

Current sample fast-growth run:

- 42 candidate extractions;
- 40 verified candidates;
- 2 rejected candidates;
- 40 verified cases;
- 120 verified paragraph cards;
- 120 proposition cards;
- 120 principle cards;
- 40 digest cards;
- 0 answer-safe cards.

The sample files are:

```text
data/legal_ingest/case_corpus/candidate_extractions/sample_candidate_extractions.jsonl
artifacts/candidate_extraction_verification_report.json
data/legal_ingest/case_corpus/candidate_verified/
artifacts/candidate_verified_cards_report.json
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
node scripts/build_case_corpus_chunks.js --sample
node scripts/embed_case_corpus_chunks.js --dry-run --sample --no-network
node scripts/index_case_corpus_qdrant.js --dry-run --sample --no-network
node scripts/evaluate_case_corpus_retrieval.js --sample
node scripts/run_case_corpus_ingest_pipeline.js --sample --no-network --dry-run
node scripts/build_sample_candidate_extractions.js --limit 40
node scripts/run_candidate_to_l35_batch.js --dry-run --build-cards
node scripts/validate_candidate_extraction_verification.js
node scripts/validate_case_corpus_l1_l35_status.js
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

The RAG pipeline dashboard also reports chunk, embedding, dry-run vector, retrieval-eval, duplicate and ingest-failure metrics. Current sample metrics include 1,012 chunks, 1,012 embedded dry-run vectors, Precision@5 of 0.925, Recall@10 of 0.341798, source-proof rate of 1, wrong-domain leak rate of 0, unsupported-query abstention rate of 1, duplicate rate of 0, and zero failed or retryable ingest records.

The candidate fast-growth dashboard reports candidate extraction totals, verified/rejected candidates, rejection reasons, verified cases added, candidate paragraph cards, propositions, principles and digests. These are speed-layer metrics only; they do not change the L4 answer-safe boundary.

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
