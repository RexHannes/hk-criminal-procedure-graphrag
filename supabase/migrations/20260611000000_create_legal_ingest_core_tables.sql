-- Core Legal Ingest tables for source-card backed answers.
-- Runs before proposition_node_links because that table references proposition_cards.
--
-- This migration gives the ingestion sidecar durable product tables. Public
-- APIs should continue to read through server-side endpoints; RLS is enabled
-- and no broad anon read policies are created here.

create table if not exists public.source_registry (
  id uuid primary key default gen_random_uuid(),
  source_id text not null unique,
  source_type text not null,
  title text not null,
  jurisdiction text not null default 'Hong Kong',
  court text,
  citation text,
  source_url text,
  raw_file_uri text,
  license_status text not null,
  storage_policy text not null,
  checksum text not null,
  ingest_status text not null default 'registered',
  review_status text not null default 'unreviewed',
  visibility text not null default 'public_metadata',
  rag_policy jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint source_registry_source_type_check
    check (source_type in ('case', 'legislation', 'practice_direction', 'court_form', 'firm_precedent', 'licensed_book', 'private_doctrine_note')),
  constraint source_registry_license_status_check
    check (license_status in ('public_judgment', 'public_legislation', 'official_reference', 'firm_private', 'licensed_private', 'metadata_only', 'prohibited', 'unknown')),
  constraint source_registry_storage_policy_check
    check (storage_policy in ('public_metadata_public_raw', 'public_metadata_private_raw', 'private_vault_only', 'metadata_only_no_raw', 'do_not_index')),
  constraint source_registry_ingest_status_check
    check (ingest_status in ('registered', 'uploaded', 'parsed', 'validated', 'indexed', 'blocked', 'failed')),
  constraint source_registry_review_status_check
    check (review_status in ('unreviewed', 'machine_checked', 'lawyer_review_required', 'approved', 'rejected')),
  constraint source_registry_visibility_check
    check (visibility in ('public_source', 'public_metadata', 'firm_private', 'licensed_private', 'blocked')),
  constraint source_registry_checksum_sha256_check
    check (checksum ~ '^[0-9a-f]{64}$')
);

create table if not exists public.legal_paragraphs (
  id uuid primary key default gen_random_uuid(),
  paragraph_id text not null unique,
  source_id text not null references public.source_registry(source_id) on delete cascade,
  para_no text,
  pinpoint text,
  paragraph_text text not null,
  court text,
  citation text,
  jurisdiction text not null default 'Hong Kong',
  issue_tags text[] not null default '{}',
  visibility text not null default 'public_source',
  verification_status text not null default 'machine_candidate',
  answer_layer_status text not null default 'research_only',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint legal_paragraphs_verification_status_check
    check (verification_status in ('machine_candidate', 'quote_verified', 'paragraph_verified', 'source_verified', 'rejected')),
  constraint legal_paragraphs_answer_layer_status_check
    check (answer_layer_status in ('research_only', 'not_product_answer_layer', 'answer_safe'))
);

create table if not exists public.proposition_cards (
  id uuid primary key default gen_random_uuid(),
  proposition_id text not null unique,
  source_id text not null references public.source_registry(source_id) on delete cascade,
  paragraph_id text references public.legal_paragraphs(paragraph_id) on delete set null,
  section_id text,
  citation text,
  pinpoint text,
  proposition_text text not null,
  supporting_quote text not null,
  issue_tags text[] not null default '{}',
  jurisdiction text not null default 'Hong Kong',
  authority_role text not null,
  confidence text not null default 'low',
  verification_status text not null default 'machine_candidate',
  answer_layer_status text not null default 'research_only',
  review_status text not null default 'unreviewed',
  source_license_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint proposition_cards_authority_role_check
    check (authority_role in ('holding', 'applied_principle', 'obiter', 'party_argument', 'factual_background', 'procedural_history', 'legislative_text', 'form_metadata', 'secondary_commentary', 'secondary_check_required')),
  constraint proposition_cards_confidence_check
    check (confidence in ('high', 'medium', 'low')),
  constraint proposition_cards_verification_status_check
    check (verification_status in ('machine_candidate', 'quote_verified', 'candidate_pending_review', 'source_verified', 'rejected', 'verified')),
  constraint proposition_cards_answer_layer_status_check
    check (answer_layer_status in ('research_only', 'not_product_answer_layer', 'answer_safe')),
  constraint proposition_cards_review_status_check
    check (review_status in ('unreviewed', 'lawyer_review_required', 'approved', 'rejected')),
  constraint proposition_cards_answer_safe_requires_approved
    check (answer_layer_status <> 'answer_safe' or review_status = 'approved')
);

create table if not exists public.form_metadata (
  id uuid primary key default gen_random_uuid(),
  form_id text not null unique,
  title text not null,
  form_family text not null,
  document_type text not null,
  court text,
  procedural_stage text,
  source_status text not null,
  copyright_status text not null,
  trigger_conditions text[] not null default '{}',
  required_facts text[] not null default '{}',
  linked_issues text[] not null default '{}',
  linked_procedure_steps text[] not null default '{}',
  field_schema jsonb not null default '[]'::jsonb,
  template_vault_ref text,
  review_status text not null default 'machine_extracted_candidate',
  output_mode text not null default 'draft_only_lawyer_review_required',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint form_metadata_source_status_check
    check (source_status in ('official_form_metadata', 'metadata_only', 'metadata_only_or_firm_private_template', 'firm_private_template', 'licensed_template')),
  constraint form_metadata_copyright_status_check
    check (copyright_status in ('public_official', 'metadata_only_no_full_text_reproduced', 'private_firm_use_only', 'licensed_private', 'unknown_needs_review')),
  constraint form_metadata_review_status_check
    check (review_status in ('machine_extracted_candidate', 'lawyer_review_required', 'approved', 'rejected')),
  constraint form_metadata_output_mode_check
    check (output_mode in ('metadata_only', 'draft_only_lawyer_review_required', 'approved_template_lawyer_review_required'))
);

create table if not exists public.answer_contracts (
  id uuid primary key default gen_random_uuid(),
  contract_id text not null unique,
  domain text not null,
  practice_area text,
  scenario_family text not null,
  scenario_subtype text not null,
  user_perspective text not null,
  procedural_posture text not null,
  primary_issues text[] not null default '{}',
  excluded_issues text[] not null default '{}',
  forbidden_terms_or_families text[] not null default '{}',
  answer_sections text[] not null default '{}',
  required_next_steps text[] not null default '{}',
  required_missing_facts text[] not null default '{}',
  verification_rule text not null,
  source_audit_policy text not null default 'collapsed_by_default',
  review_status text not null default 'research_only',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint answer_contracts_source_audit_policy_check
    check (source_audit_policy in ('collapsed_by_default', 'expanded_for_review_only')),
  constraint answer_contracts_review_status_check
    check (review_status in ('research_only', 'lawyer_review_required', 'approved'))
);

create table if not exists public.human_review_queue (
  id uuid primary key default gen_random_uuid(),
  review_item_id text not null unique,
  item_type text not null,
  item_id text not null,
  priority text not null default 'normal',
  reason text not null,
  status text not null default 'open',
  assigned_to uuid,
  reviewed_by uuid,
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint human_review_queue_priority_check
    check (priority in ('low', 'normal', 'high', 'urgent')),
  constraint human_review_queue_status_check
    check (status in ('open', 'in_review', 'approved', 'rejected', 'blocked'))
);

create table if not exists public.eval_runs (
  id uuid primary key default gen_random_uuid(),
  eval_id text not null unique,
  query text not null,
  expected_domain text,
  expected_scenario text,
  must_include_issues text[] not null default '{}',
  must_include_form_ids text[] not null default '{}',
  must_not_include text[] not null default '{}',
  requires_source_cards boolean not null default true,
  status text not null default 'pending',
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint eval_runs_status_check
    check (status in ('pending', 'passed', 'failed', 'skipped'))
);

create index if not exists source_registry_type_status_idx
  on public.source_registry (source_type, ingest_status, review_status);
create index if not exists legal_paragraphs_source_idx
  on public.legal_paragraphs (source_id);
create index if not exists legal_paragraphs_issue_tags_idx
  on public.legal_paragraphs using gin (issue_tags);
create index if not exists proposition_cards_issue_tags_idx
  on public.proposition_cards using gin (issue_tags);
create index if not exists proposition_cards_review_idx
  on public.proposition_cards (verification_status, review_status, answer_layer_status);
create index if not exists form_metadata_trigger_idx
  on public.form_metadata using gin (trigger_conditions);
create index if not exists human_review_queue_status_idx
  on public.human_review_queue (status, priority);
create index if not exists eval_runs_status_idx
  on public.eval_runs (status);

alter table public.source_registry enable row level security;
alter table public.legal_paragraphs enable row level security;
alter table public.proposition_cards enable row level security;
alter table public.form_metadata enable row level security;
alter table public.answer_contracts enable row level security;
alter table public.human_review_queue enable row level security;
alter table public.eval_runs enable row level security;

create or replace function public.set_legal_ingest_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_source_registry_updated_at on public.source_registry;
create trigger set_source_registry_updated_at
before update on public.source_registry
for each row execute function public.set_legal_ingest_updated_at();

drop trigger if exists set_legal_paragraphs_updated_at on public.legal_paragraphs;
create trigger set_legal_paragraphs_updated_at
before update on public.legal_paragraphs
for each row execute function public.set_legal_ingest_updated_at();

drop trigger if exists set_proposition_cards_updated_at on public.proposition_cards;
create trigger set_proposition_cards_updated_at
before update on public.proposition_cards
for each row execute function public.set_legal_ingest_updated_at();

drop trigger if exists set_form_metadata_updated_at on public.form_metadata;
create trigger set_form_metadata_updated_at
before update on public.form_metadata
for each row execute function public.set_legal_ingest_updated_at();

drop trigger if exists set_answer_contracts_updated_at on public.answer_contracts;
create trigger set_answer_contracts_updated_at
before update on public.answer_contracts
for each row execute function public.set_legal_ingest_updated_at();

drop trigger if exists set_human_review_queue_updated_at on public.human_review_queue;
create trigger set_human_review_queue_updated_at
before update on public.human_review_queue
for each row execute function public.set_legal_ingest_updated_at();

drop trigger if exists set_eval_runs_updated_at on public.eval_runs;
create trigger set_eval_runs_updated_at
before update on public.eval_runs
for each row execute function public.set_legal_ingest_updated_at();

comment on table public.source_registry is 'Canonical source registry for public, licensed, firm-private, and metadata-only legal materials.';
comment on table public.legal_paragraphs is 'Paragraph or provision-level legal source units used for quote/pinpoint retrieval.';
comment on table public.proposition_cards is 'Human-reviewable legal propositions tied to exact source quotes and legal paragraphs.';
comment on table public.form_metadata is 'Metadata-only form and document candidates; no proprietary full text should be stored here.';
comment on table public.answer_contracts is 'Structured answer contracts that control scenario, section, exclusion, and verification rules.';
comment on table public.human_review_queue is 'Review queue for promoting machine candidates to source_verified/lawyer_reviewed/answer_safe.';
comment on table public.eval_runs is 'Golden query expectations and run results for legal answer quality checks.';
