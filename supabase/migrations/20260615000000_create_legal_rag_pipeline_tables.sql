-- Legal RAG pipeline tables.
--
-- These tables bridge source registry records to chunking, vector indexing and
-- source-gated retrieval. They are service-side infrastructure: RLS is enabled
-- and no anon/authenticated browser policies are granted here.

create table if not exists public.legal_ingest_runs (
  id uuid primary key default gen_random_uuid(),
  run_id text not null unique,
  source_id text not null references public.source_registry(source_id) on delete cascade,
  pipeline_version text not null default 'legal_rag_pipeline_v1',
  stage text not null default 'registered',
  status text not null default 'pending',
  policy_snapshot jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint legal_ingest_runs_stage_check
    check (stage in ('registered', 'uploaded', 'parsed', 'chunked', 'embedded', 'indexed', 'reviewed', 'blocked', 'failed')),
  constraint legal_ingest_runs_status_check
    check (status in ('pending', 'running', 'passed', 'failed', 'blocked'))
);

create table if not exists public.legal_chunks (
  id uuid primary key default gen_random_uuid(),
  chunk_id text not null unique,
  source_id text not null references public.source_registry(source_id) on delete cascade,
  paragraph_id text references public.legal_paragraphs(paragraph_id) on delete set null,
  para_start text,
  para_end text,
  pinpoint text,
  chunk_hash text not null,
  text_ref text not null,
  char_count integer not null default 0,
  visibility text not null default 'public_metadata',
  review_status text not null default 'lawyer_review_required',
  answer_layer_status text not null default 'research_only',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint legal_chunks_hash_check
    check (chunk_hash ~ '^[0-9a-f]{64}$'),
  constraint legal_chunks_visibility_check
    check (visibility in ('public_source', 'public_metadata', 'firm_private', 'licensed_private', 'blocked')),
  constraint legal_chunks_review_status_check
    check (review_status in ('unreviewed', 'machine_checked', 'lawyer_review_required', 'approved', 'rejected')),
  constraint legal_chunks_answer_layer_status_check
    check (answer_layer_status in ('research_only', 'not_product_answer_layer', 'answer_safe')),
  constraint legal_chunks_answer_safe_requires_approved
    check (answer_layer_status <> 'answer_safe' or review_status = 'approved')
);

create table if not exists public.vector_index_manifests (
  id uuid primary key default gen_random_uuid(),
  manifest_id text not null unique,
  source_id text not null references public.source_registry(source_id) on delete cascade,
  chunk_id text not null references public.legal_chunks(chunk_id) on delete cascade,
  backend text not null default 'qdrant',
  vector_namespace text not null,
  embedding_model text not null,
  payload jsonb not null,
  index_status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vector_index_manifests_backend_check
    check (backend in ('qdrant', 'pgvector', 'pinecone', 'opensearch')),
  constraint vector_index_manifests_status_check
    check (index_status in ('pending', 'embedded', 'indexed', 'failed', 'blocked')),
  constraint vector_index_manifests_private_namespace_check
    check (
      (payload->>'visibility' not in ('firm_private', 'licensed_private'))
      or vector_namespace like 'private:%'
    )
);

create table if not exists public.retrieval_eval_cases (
  id uuid primary key default gen_random_uuid(),
  eval_id text not null unique,
  query text not null,
  expected_scenario text not null,
  required_sections text[] not null default '{}',
  must_include_source_ids text[] not null default '{}',
  must_exclude_issue_tags text[] not null default '{}',
  must_not_surface_raw_scores boolean not null default true,
  status text not null default 'pending',
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint retrieval_eval_cases_status_check
    check (status in ('pending', 'passed', 'failed', 'skipped'))
);

create index if not exists legal_ingest_runs_source_stage_idx
  on public.legal_ingest_runs (source_id, stage, status);
create index if not exists legal_chunks_source_idx
  on public.legal_chunks (source_id);
create index if not exists legal_chunks_visibility_review_idx
  on public.legal_chunks (visibility, review_status, answer_layer_status);
create index if not exists vector_index_manifests_source_idx
  on public.vector_index_manifests (source_id);
create index if not exists vector_index_manifests_namespace_status_idx
  on public.vector_index_manifests (vector_namespace, index_status);
create index if not exists retrieval_eval_cases_status_idx
  on public.retrieval_eval_cases (status);

alter table public.legal_ingest_runs enable row level security;
alter table public.legal_chunks enable row level security;
alter table public.vector_index_manifests enable row level security;
alter table public.retrieval_eval_cases enable row level security;

drop trigger if exists set_legal_ingest_runs_updated_at on public.legal_ingest_runs;
create trigger set_legal_ingest_runs_updated_at
before update on public.legal_ingest_runs
for each row execute function public.set_legal_ingest_updated_at();
drop trigger if exists set_legal_chunks_updated_at on public.legal_chunks;
create trigger set_legal_chunks_updated_at
before update on public.legal_chunks
for each row execute function public.set_legal_ingest_updated_at();

drop trigger if exists set_vector_index_manifests_updated_at on public.vector_index_manifests;
create trigger set_vector_index_manifests_updated_at
before update on public.vector_index_manifests
for each row execute function public.set_legal_ingest_updated_at();

drop trigger if exists set_retrieval_eval_cases_updated_at on public.retrieval_eval_cases;
create trigger set_retrieval_eval_cases_updated_at
before update on public.retrieval_eval_cases
for each row execute function public.set_legal_ingest_updated_at();
