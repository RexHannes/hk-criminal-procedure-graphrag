# Legal Ingest Remote Setup

This is the safe order for turning the local legal-ingest scaffold into remote product data.

## 1. Apply Supabase migrations

Apply every SQL file in `supabase/migrations/` to the remote Supabase database before seeding source cards.

If `psql` and `SUPABASE_DB_URL` are available, run:

```bash
node scripts/setup_supabase_legal_ingest.js --apply-migrations
```

Otherwise, apply the same migration SQL files through the Supabase SQL editor or your usual deployment pipeline.

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
