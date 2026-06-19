# Production Hardening Roadmap

This repo now has a working local source-gated pilot and a safe hosted-demo scaffold. It is not yet a full production HK-law Claude.

## Current Estimate

Use:

```bash
node scripts/report_mvp_readiness.js
```

The estimate is deliberately conservative. It measures engineering/product readiness, not legal correctness.

## Remaining Gates

1. Corpus scale
   - Ingest more public judgments, legislation, rules, and practice directions.
   - Keep paragraph/provision cards citation-pinned.
   - Keep private/client/licensed sources out of public-demo namespace.

2. Real embeddings and hybrid retrieval
   - Replace `local-hash` with configured production embeddings.
   - Validate collection dimensions before reindexing.
   - Preserve metadata filters for jurisdiction, source type, review status, source visibility, and tenant.
   - Add optional reranker provider only after source gates are stable.

3. Review promotion
   - Machine candidates must not become answer-safe automatically.
   - Promotion path:

```text
machine_candidate -> quote_verified -> source_verified -> lawyer_reviewed -> answer_safe
```

4. Private-source access controls
   - Replace demo Clerk token parsing with real Clerk JWT verification.
   - Derive tenant only from Clerk org/user ids.
   - Public mode retrieves only `public_demo` + `tenant_id=public`.
   - Private mode retrieves only matching tenant private sources.

5. Evaluation
   - Expand golden queries across criminal, PI, probate, company forms, civil procedure, and SOP/form workflows.
   - Prefer `cannot_verify` over noisy wrong citations.

## Upload Rule

Do not upload private books/forms/client documents until:

- Clerk tenant auth is real;
- private ingestion is explicitly enabled;
- private-source retrieval tests pass;
- no raw private text can leak to public output;
- lawyer review promotion is operational.
