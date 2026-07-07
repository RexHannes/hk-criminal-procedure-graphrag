# Scale Gate Green-Up

Use this when deciding whether the criminal case-fruit pipeline may scale beyond branch pilots.

Run:

```bash
node scripts/report_scale_gate_greenup.js --target-cases 10000
```

For local development only, this may write safe `.env.local` defaults:

```bash
node scripts/report_scale_gate_greenup.js --target-cases 10000 --write-local-dev-env
```

This sets:

```text
INNGEST_DEV=1
OPENROUTER_FREE_ONLY=true
OPENROUTER_ALLOW_PAID=false
```

It does **not** add provider keys and does **not** approve legal propositions.

If `OPENROUTER_API_KEY` is already present, the script also writes the free-only
OpenRouter retrieval defaults:

```text
OPENROUTER_MODEL=nvidia/nemotron-3-ultra-550b-a55b:free
LEGAL_EMBEDDING_PROVIDER=openrouter
LEGAL_EMBEDDING_MODEL=nvidia/llama-nemotron-embed-vl-1b-v2:free
LEGAL_EMBEDDING_DIM=2048
LEGAL_RERANK_PROVIDER=openrouter
LEGAL_RERANK_MODEL=nvidia/llama-nemotron-rerank-vl-1b-v2:free
```

The model IDs deliberately end in `:free`, so the OpenRouter free-only guard can
allow them while leaving the paid-model override disabled.

## What Can Be Automated

```text
durable_orchestration_configured
```

can be green for local dev with `INNGEST_DEV=1`. Production should use real `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY`.

## What Cannot Be Faked

```text
production_embeddings_configured
production_reranker_configured
bail_gold_review_set_exists
```

require real inputs:

- embeddings: Voyage, Cohere, OpenAI, or OpenRouter with a free embedding model;
- reranker: Cohere, Voyage, or OpenRouter with a free rerank model;
- gold review: human/legal approval of at least 3 CFA bail propositions.

DeepSeek chat keys do not clear the embedding or reranker gates. OpenRouter can
clear those gates only when configured as the embedding/rerank provider with
free `:free` model IDs or an explicit paid override.

## Review Packet

The first bail gold-set candidates are in:

```text
data/legal_ingest/criminal_evidence_tree_v1/bail_public_batch_v1/answer_safe_review_packet.json
```

Codex must not auto-promote those cards. They remain `machine_candidate` until a human reviewer checks the public paragraph, proposition summary, authority role, lineage/treatment, and doctrine-node links.
