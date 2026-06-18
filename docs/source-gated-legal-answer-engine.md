# Source-Gated Legal Answer Engine

This repo now has a local v0.3 legal answer layer for the HK LegalTech RAG MVP. It is deliberately conservative: retrieved source cards drive the answer, and unsupported legal propositions are moved to `cannot_verify`.

## Architecture

```text
User query
  -> Qdrant retrieval over structured legal objects
  -> EvidencePack
  -> extractive source-gated answer generator
  -> verification gates
  -> CLI / future API renderer
```

The engine is not a general chatbot. It is a research assistant that explains what the current legal database can verify.

## Evidence Pack

`src/legal_answer/build_evidence_pack.js` converts Qdrant hits into a serializable evidence pack:

- top retrieved chunks;
- grouped proposition-card families;
- source metadata;
- retrieval scores;
- exact excerpts;
- retrieval trace;
- metadata warnings.

Smoke command:

```bash
node scripts/build_legal_evidence_pack_smoke.js --query "What is the rule on inconsistent pleadings?"
```

## Legal Answer Schema

`src/legal_answer/schema.js` defines the canonical objects:

- `LegalSource`
- `EvidenceChunk`
- `LegalCitation`
- `LegalClaim`
- `LegalAnswer`
- `RetrievalTrace`
- `VerificationResult`

Every legal claim must carry source citations and excerpt ids. The answer object also keeps warnings, retrieval trace, and `cannot_verify` items.

## No-Source / No-Answer Rule

If no sufficiently on-point source card is retrieved, the generator must not create a legal claim. It returns:

```text
No verified answer can be given from the current database.
```

and records why in `cannot_verify`.

This matters because local dev embeddings can return nearby-but-wrong Qdrant hits. The answer layer checks whether the retrieved evidence is on point before using it.

## Proposition Cards vs Authority

The current inconsistent-pleadings vertical mostly indexes proposition cards. Those are useful structured research objects, but they are not automatically direct authority.

The answer therefore labels them as:

```text
proposition-card based, research-only unless reviewed
```

Direct case, ordinance, rule, practice direction, and paragraph cards can be promoted later through the review workflow.

## Optional LLM Adapter

`src/legal_answer/llm_adapter.js` is an interface only. It defaults to:

```text
LLM_PROVIDER=none
```

When disabled, the local extractive/template answer generator is used.

Future providers may be configured with:

```text
LLM_PROVIDER=anthropic
LLM_PROVIDER=openai
LLM_PROVIDER=local
```

No real API keys are committed. Any future LLM must receive only the evidence pack and must be instructed to answer from that evidence, cite every legal claim, and say `not verified from current database` when unsupported.

## Verification Gates

`src/legal_answer/verify_legal_answer.js` checks:

- every legal claim has at least one source;
- every source has `source_id` and `chunk_id`;
- citations reference retrieved excerpts;
- retrieval trace includes query, collection, top-k, returned count, and scores;
- invented citation-like strings are rejected;
- private/licensed source kinds are rejected in public-demo mode.

Run:

```bash
node scripts/validate_source_gated_answer.js
node scripts/validate_legal_golden_queries.js
```

## CLI

```bash
node scripts/query_legal_assistant.js "What is the rule on inconsistent pleadings?"
node scripts/query_legal_assistant.js "What is the rule on inconsistent pleadings?" --json
```

The CLI prints:

- answer summary;
- legal claims;
- sources used;
- retrieval trace;
- warnings;
- cannot-verify items;
- verification result.

## Why Student-Pack Cloud Services Are Planning-Only

DigitalOcean, Doppler/1Password, and Clerk are useful next services:

- DigitalOcean can host Qdrant/FastAPI demos.
- Doppler or 1Password can manage secrets.
- Clerk can provide tenant auth before private-source ingestion.

They are not required for the local source-gated engine. Private books, forms, or client materials should not be uploaded until tenant isolation, private storage, access control, review status, and source-licence controls are active.

## Current MVP Boundary

This engine proves traceability on a narrow public/source-card vertical. It is not yet a full HK-law corpus. Before private/licensed ingestion, the remaining production work is:

- real embedding provider and dimensions;
- hybrid retrieval and reranking;
- durable ingestion orchestration;
- larger public judgment corpus;
- source review and answer-safe promotion;
- tenant/private-source controls.
