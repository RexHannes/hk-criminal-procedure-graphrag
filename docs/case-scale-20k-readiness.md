# Criminal Case Scale Readiness

This repo is not ready for a 20,000-case criminal-law crawl yet. It is now prepared to *plan* and *gate* that scale.

The safe path is:

```text
8-case bail evidence batch
-> 20-50 bail cases
-> 100 cases in one section
-> 300 cases in one section
-> 1000 selected-section cases
-> 5000 domain cases
-> 20000 domain cases
```

Each rung must stay source-gated:

- public sources only for public demo scale runs;
- exact quote required;
- paragraph pinpoint required;
- known doctrine node required;
- outputs enter review as `machine_candidate`;
- no auto `answer_safe`;
- no private/licensed material in public scale runs.

## Readiness Check

```bash
node scripts/validate_case_scale_readiness.js --target-cases 20000
```

This should currently report `blocked_for_large_scale`. That is correct.

Use `--require-green` only in CI when a large run must be fully production-ready:

```bash
node scripts/validate_case_scale_readiness.js --target-cases 20000 --require-green
```

## Run Planning

Generate a blocked preflight plan for 20,000 cases:

```bash
node scripts/plan_case_scale_run.js \
  --target-cases 20000 \
  --scope criminal_domain_public_cases \
  --cases-per-shard 100
```

The plan includes deterministic shard boundaries, resume requirements and safeguards. It does not authorize execution unless readiness gates pass.

Guard a shard before any worker touches sources:

```bash
node scripts/run_case_scale_shard.js \
  --plan artifacts/case_scale_20000.json \
  --shard-id shard_0001
```

Blocked plans exit non-zero. For CI/preflight reports without execution:

```bash
node scripts/run_case_scale_shard.js \
  --plan artifacts/case_scale_20000.json \
  --shard-id shard_0001 \
  --preflight-only
```

## Semi-Auto Extraction Contract

LLMs, including DeepSeek, may propose candidate extraction rules only in this shape:

```text
source_id
paragraph_no
exact_quote
proposition_text
candidate_doctrine_node_ids
significance_label
authority_role
confidence
```

Validate proposals:

```bash
node scripts/validate_semiauto_rule_proposals.js
```

The validator fetches the public LegalRef source, extracts the numbered paragraph, verifies the exact quote and checks every doctrine node ID. Rejected proposals must not enter the batch.

Compile mode is only for reviewed proposal reports:

```bash
node scripts/validate_semiauto_rule_proposals.js --compile-rules --output artifacts/semiauto_bail_rule_report.json
```

Compiled rules still remain `machine_candidate` only.

Generate proposals with DeepSeek only when deliberately configured:

```bash
DEEPSEEK_API_KEY=... node scripts/propose_semiauto_rules_deepseek.js \
  --source-id hk_cfi_2021_lai_chee_ying_hccp_738_2020 \
  --paragraph-no 13 \
  --html /path/to/legalref-body.html \
  --allowed-nodes criminal_procedure_hk.bail_factors,criminal_procedure_hk.bail_flow_step5,criminal_procedure_hk.nsl_bail
```

The output is still passed through `validate_semiauto_rule_proposals.js`; DeepSeek never writes directly into the evidence batch.

## Production Embeddings / Rerank

The Qdrant index/search path now uses the shared embedding adapter.

Supported embedding providers:

```bash
LEGAL_EMBEDDING_PROVIDER=openai
OPENAI_API_KEY=...
LEGAL_EMBEDDING_MODEL=text-embedding-3-small
LEGAL_EMBEDDING_DIM=1536

LEGAL_EMBEDDING_PROVIDER=voyage
VOYAGE_API_KEY=...
LEGAL_EMBEDDING_MODEL=voyage-3-large

LEGAL_EMBEDDING_PROVIDER=cohere
COHERE_API_KEY=...
LEGAL_EMBEDDING_MODEL=embed-v4.0
```

Supported rerank providers:

```bash
LEGAL_RERANK_PROVIDER=cohere
COHERE_API_KEY=...
LEGAL_RERANK_MODEL=rerank-v3.5

LEGAL_RERANK_PROVIDER=voyage
VOYAGE_API_KEY=...
LEGAL_RERANK_MODEL=rerank-2
```

Changing embedding dimensions requires a separate Qdrant collection or intentional reindex. The indexer refuses dimension mismatches.

To check the whole setup ladder in one report:

```bash
node scripts/validate_production_setup_contract.js
```

That report distinguishes:

- local smoke readiness;
- bail-only 20-50 public-source scaling;
- production retrieval readiness;
- durable Inngest orchestration;
- human-reviewed gold bail cards;
- private-source ingestion controls;
- 20k preflight gates.

## Current Blockers Before 20,000

- production embeddings are not configured;
- production reranker is not configured;
- durable orchestration is not configured;
- no 3-5 proposition CFA bail answer-safe gold set yet;
- retrieval quality floor is not satisfied across criminal law;
- hybrid auto-link precision report does not exist;
- private-source access controls remain partial.

That is deliberate. The system should scale by evidence and review, not by dumping 20,000 cases into vectors and hoping the tree sorts itself out.
