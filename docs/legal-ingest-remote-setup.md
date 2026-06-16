# Legal Ingest Remote Setup

This is the safe order for turning the local legal-ingest scaffold into remote product data.

## 1. Apply Supabase migrations

Apply every SQL file in `supabase/migrations/` to the remote Supabase database before seeding source cards.

First confirm the target project:

```bash
node scripts/setup_supabase_legal_ingest.js --target
```

This prints the Supabase URL/project ref and whether the local environment has a service-role key and database URL. It does not print secrets.

If a service-role key is configured, inspect the remote schema mode:

```bash
node scripts/setup_supabase_legal_ingest.js --schema-report
```

The runner distinguishes:

- `source_card_v1`: the clean/new schema expected by the source-card setup runner.
- `legacy_case_schema`: the older `Case` project shape using `source_documents`, `legal_cases`, `legal_paragraphs`, `proposition_cards`, and `human_review_items`.
- `incompatible_or_missing`: neither supported shape is complete enough to seed safely.

If `psql` and `SUPABASE_DB_URL` are available, run:

```bash
node scripts/setup_supabase_legal_ingest.js --apply-migrations
```

Otherwise, apply the same migration SQL files through the Supabase SQL editor or your usual deployment pipeline.

If the live review endpoint reports:

```text
Could not find the table 'public.human_review_queue'
Perhaps you meant the table 'public.human_review_items'
```

then Vercel is pointing at the right Supabase project, but that project is still on an older legal-ingest schema. Apply the committed migrations below to that same project.

If you intentionally want to keep that older `Case` schema, do not force the fresh-schema seed into it. Use the compatibility seed path instead:

```bash
node scripts/setup_supabase_legal_ingest.js --seed-inconsistent --legacy-compatible-seed
```

That maps the inconsistent-pleadings vertical into the older case/paragraph/proposition/review tables. It does not create `answer_safe` cards and does not upload books or private forms.

The required tables are:

- `source_registry`
- `legal_paragraphs`
- `proposition_cards`
- `form_metadata`
- `answer_contracts`
- `human_review_queue`
- `eval_runs`
- `legal_ingest_runs`
- `legal_chunks`
- `vector_index_manifests`
- `retrieval_eval_cases`

RLS is enabled. Server-side endpoints should use the service-role key; browser code must never receive that key.

## 2. Create private storage buckets

Run:

```bash
node scripts/setup_supabase_legal_ingest.js
```

The script creates these private buckets if they do not already exist:

- `legal-private-vault`
- `legal-public-sources`
- `legal-parsed-artifacts`

The script also verifies that the required legal-ingest tables are exposed to the server-side REST API.

## 3. Wire upload service to Supabase Storage

Set server-side environment variables:

```bash
LEGAL_STORAGE_BACKEND=supabase
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
LEGAL_REVIEW_ADMIN_TOKEN=...
```

With those set, `legal-ingest-service/app/main.py` stores uploaded raw files in Supabase Storage according to the source policy:

- public judgments: public legal source bucket, research-only;
- licensed books: private vault only;
- firm precedents/forms: private vault only;
- unknown/prohibited sources: blocked or metadata-only.

## 4. Ingest one public-case vertical

Only after migrations and bucket checks pass, run:

```bash
node scripts/setup_supabase_legal_ingest.js --seed-inconsistent
```

For an older `legacy_case_schema` project, run:

```bash
node scripts/setup_supabase_legal_ingest.js --seed-inconsistent --legacy-compatible-seed
```

To apply migrations and seed in one run:

```bash
node scripts/setup_supabase_legal_ingest.js --apply-migrations --seed-inconsistent
```

This upserts the inconsistent-pleadings vertical:

- public case source records;
- paragraph cards;
- quote-checked proposition cards;
- metadata-only form/document candidates;
- answer contract;
- human review queue item;
- golden eval row.

The cards remain `research_only` / `lawyer_review_required`. The script does not promote any card to `answer_safe`.

For an end-to-end stage report, run:

```bash
node scripts/run_legal_rag_pipeline.js --remote
```

To seed and then verify in one pass:

```bash
node scripts/run_legal_rag_pipeline.js --remote --seed
```

The report covers:

- source governance;
- storage bucket availability;
- paragraph/chunk objects;
- quote-exact proposition validation;
- form/document candidates;
- review queue;
- remote row counts;
- answer-memory table checks;
- Qdrant/vector status.

For the broader minimum "HK law Claude" readiness check, run:

```bash
node scripts/validate_hk_law_claude_mvp.js
```

Use the stricter mode only when you expect production infrastructure to be fully configured:

```bash
node scripts/validate_hk_law_claude_mvp.js --strict-production
```

The MVP gates are documented in `docs/hk-law-claude-mvp.md` and configured in
`data/legal_ingest/mvp/hk_law_claude_mvp.json`.

## 5. Review queue approval

Use:

```text
GET  /api/legal-ingest/review-queue
POST /api/legal-ingest/review/[card_id]/approve
```

Approval requires `LEGAL_REVIEW_ADMIN_TOKEN`. Promotion to `answer_safe` is explicit and should only be done after lawyer review.

## 6. Private book/form ingestion

Do not upload licensed books or firm forms into GitHub or raw public vector search.

Only ingest them after:

- remote migrations exist;
- private buckets exist;
- upload service uses Supabase Storage;
- review queue works;
- at least one public-case vertical has been seeded and checked.

Private books/forms should stay in `legal-private-vault` and enter the product as private doctrine notes, field schemas, candidate propositions, or approved firm templates depending on licence and review status.

## 7. Stored retrieved law / SOP cache

Apply this migration before enabling cache writes:

```text
supabase/migrations/20260616000000_create_legal_answer_memory_tables.sql
```

The cache tables are:

- `retrieval_bundles`
- `legal_answer_snapshots`
- `sop_playbooks`

They exist so a reviewed retrieved-law answer or SOP flow can be reused without regenerating from zero every time. A cached answer must be downgraded or recomputed if its source fingerprint changes, if a supporting source card is rejected/stale, or if the cached answer is only research-only.

The helper functions live in:

```text
legal-ingest-service/cache/retrieved_law_cache.py
```

Private books/forms may be uploaded to the private vault once the buckets and registry are configured, but they should not influence product answers until they pass:

```text
source registered
-> private raw storage
-> parser/chunker
-> quote/proposition validation
-> review queue
-> private vector namespace
-> answer contract
-> answer cross-checker
```

## 8. Qdrant indexing

The Qdrant indexer is:

```text
scripts/index_legal_ingest_qdrant.js
```

Dry-run the current source-card vertical without requiring Qdrant:

```bash
node scripts/index_legal_ingest_qdrant.js --dry-run
```

To index into Qdrant, configure:

```bash
QDRANT_URL=...
QDRANT_API_KEY=...                 # if your Qdrant instance requires it
LEGAL_EMBEDDING_PROVIDER=local-hash # dev only
LEGAL_EMBEDDING_DIM=384
```

For production embeddings, use a real embedding provider and keep the model
dimension aligned with the Qdrant collections:

```bash
LEGAL_EMBEDDING_PROVIDER=openai
OPENAI_API_KEY=...
LEGAL_EMBEDDING_MODEL=text-embedding-3-small
LEGAL_EMBEDDING_DIM=1536
```

Then run:

```bash
node scripts/index_legal_ingest_qdrant.js
```

The default collections are:

- `hk_legal_paragraphs`
- `hk_proposition_cards`
- `hk_form_metadata`

Every point includes legal metadata filters for jurisdiction, source type,
practice area, issue tags, authority role, review status, answer-layer status,
visibility and firm ID.
