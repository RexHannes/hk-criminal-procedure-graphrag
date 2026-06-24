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

- embeddings: Voyage, Cohere, OpenAI, or another implemented embedding provider key;
- reranker: Cohere or Voyage reranker key;
- gold review: human/legal approval of at least 3 CFA bail propositions.

OpenRouter and DeepSeek chat keys do not clear the embedding or reranker gates.

## Review Packet

The first bail gold-set candidates are in:

```text
data/legal_ingest/criminal_evidence_tree_v1/bail_public_batch_v1/answer_safe_review_packet.json
```

Codex must not auto-promote those cards. They remain `machine_candidate` until a human reviewer checks the public paragraph, proposition summary, authority role, lineage/treatment, and doctrine-node links.
