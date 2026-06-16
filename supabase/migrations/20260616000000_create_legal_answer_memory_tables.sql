-- Legal answer memory and SOP/playbook cache.
--
-- These tables store retrieved-law bundles and reviewed SOP-style answers so
-- the app can reuse stable, source-fingerprinted legal analysis instead of
-- regenerating from scratch on every query. They do not make research-only
-- material answer-safe; review status still controls output safety.

create table if not exists public.retrieval_bundles (
  id uuid primary key default gen_random_uuid(),
  bundle_id text not null unique,
  query_hash text not null,
  normalized_query text not null,
  domain text not null,
  scenario_family text,
  scenario_subtype text,
  user_perspective text,
  corpus_fingerprint text not null,
  source_card_ids text[] not null default '{}',
  proposition_ids text[] not null default '{}',
  paragraph_ids text[] not null default '{}',
  form_ids text[] not null default '{}',
  retrieval_filters jsonb not null default '{}'::jsonb,
  retrieval_summary jsonb not null default '{}'::jsonb,
  source_audit jsonb not null default '{}'::jsonb,
  retrieval_status text not null default 'research_only',
  review_status text not null default 'unreviewed',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint retrieval_bundles_query_hash_check
    check (query_hash ~ '^[0-9a-f]{64}$'),
  constraint retrieval_bundles_corpus_fingerprint_check
    check (corpus_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint retrieval_bundles_retrieval_status_check
    check (retrieval_status in ('research_only', 'source_verified', 'answer_safe', 'stale', 'blocked')),
  constraint retrieval_bundles_review_status_check
    check (review_status in ('unreviewed', 'machine_checked', 'lawyer_review_required', 'approved', 'rejected')),
  constraint retrieval_bundles_answer_safe_requires_approved
    check (retrieval_status <> 'answer_safe' or review_status = 'approved')
);

create table if not exists public.legal_answer_snapshots (
  id uuid primary key default gen_random_uuid(),
  answer_id text not null unique,
  bundle_id text not null references public.retrieval_bundles(bundle_id) on delete cascade,
  contract_id text,
  query_hash text not null,
  answer_mode text not null default 'professional_source_gated',
  answer_json jsonb not null,
  source_fingerprint text not null,
  unsupported_claims jsonb not null default '[]'::jsonb,
  verification_report jsonb not null default '{}'::jsonb,
  answer_status text not null default 'research_only',
  review_status text not null default 'unreviewed',
  usage_count integer not null default 0,
  last_used_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint legal_answer_snapshots_query_hash_check
    check (query_hash ~ '^[0-9a-f]{64}$'),
  constraint legal_answer_snapshots_source_fingerprint_check
    check (source_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint legal_answer_snapshots_answer_mode_check
    check (answer_mode in ('professional_source_gated', 'triage_source_gated', 'sop_playbook', 'research_only')),
  constraint legal_answer_snapshots_answer_status_check
    check (answer_status in ('research_only', 'source_verified', 'answer_safe', 'stale', 'blocked')),
  constraint legal_answer_snapshots_review_status_check
    check (review_status in ('unreviewed', 'machine_checked', 'lawyer_review_required', 'approved', 'rejected')),
  constraint legal_answer_snapshots_answer_safe_requires_approved
    check (answer_status <> 'answer_safe' or review_status = 'approved')
);

create table if not exists public.sop_playbooks (
  id uuid primary key default gen_random_uuid(),
  playbook_id text not null unique,
  domain text not null,
  scenario_family text not null,
  scenario_subtype text,
  title text not null,
  contract_id text,
  retrieval_bundle_id text references public.retrieval_bundles(bundle_id) on delete set null,
  answer_snapshot_id text references public.legal_answer_snapshots(answer_id) on delete set null,
  steps jsonb not null default '[]'::jsonb,
  forms_or_documents jsonb not null default '[]'::jsonb,
  missing_facts jsonb not null default '[]'::jsonb,
  source_card_ids text[] not null default '{}',
  proposition_ids text[] not null default '{}',
  form_ids text[] not null default '{}',
  source_fingerprint text not null,
  status text not null default 'draft',
  review_status text not null default 'lawyer_review_required',
  version integer not null default 1,
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  firm_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sop_playbooks_source_fingerprint_check
    check (source_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint sop_playbooks_status_check
    check (status in ('draft', 'source_verified', 'lawyer_reviewed', 'answer_safe', 'stale', 'retired')),
  constraint sop_playbooks_review_status_check
    check (review_status in ('unreviewed', 'machine_checked', 'lawyer_review_required', 'approved', 'rejected')),
  constraint sop_playbooks_answer_safe_requires_approved
    check (status <> 'answer_safe' or review_status = 'approved')
);

create index if not exists retrieval_bundles_query_domain_idx
  on public.retrieval_bundles (query_hash, domain, retrieval_status, review_status);
create index if not exists retrieval_bundles_source_ids_idx
  on public.retrieval_bundles using gin (source_card_ids);
create index if not exists retrieval_bundles_prop_ids_idx
  on public.retrieval_bundles using gin (proposition_ids);
create index if not exists legal_answer_snapshots_bundle_idx
  on public.legal_answer_snapshots (bundle_id, answer_status, review_status);
create index if not exists legal_answer_snapshots_query_idx
  on public.legal_answer_snapshots (query_hash, source_fingerprint);
create index if not exists sop_playbooks_domain_scenario_idx
  on public.sop_playbooks (domain, scenario_family, scenario_subtype, status, review_status);
create index if not exists sop_playbooks_source_ids_idx
  on public.sop_playbooks using gin (source_card_ids);

alter table public.retrieval_bundles enable row level security;
alter table public.legal_answer_snapshots enable row level security;
alter table public.sop_playbooks enable row level security;

drop trigger if exists set_retrieval_bundles_updated_at on public.retrieval_bundles;
create trigger set_retrieval_bundles_updated_at
before update on public.retrieval_bundles
for each row execute function public.set_legal_ingest_updated_at();

drop trigger if exists set_legal_answer_snapshots_updated_at on public.legal_answer_snapshots;
create trigger set_legal_answer_snapshots_updated_at
before update on public.legal_answer_snapshots
for each row execute function public.set_legal_ingest_updated_at();

drop trigger if exists set_sop_playbooks_updated_at on public.sop_playbooks;
create trigger set_sop_playbooks_updated_at
before update on public.sop_playbooks
for each row execute function public.set_legal_ingest_updated_at();

