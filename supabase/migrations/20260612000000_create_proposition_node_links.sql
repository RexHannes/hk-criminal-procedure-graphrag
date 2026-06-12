-- Links extracted case-law propositions to maintained doctrine graph nodes.
--
-- This migration is intentionally conservative:
-- - machine/LLM links default to machine_candidate;
-- - answer_safe/human_reviewed promotion is represented but should only be set by
--   a human review workflow;
-- - RLS is enabled and no anon/authenticated read policy is created, because the
--   public viewer should access evidence only through server-side Vercel APIs
--   using SUPABASE_SERVICE_ROLE_KEY.

create table if not exists public.proposition_node_links (
  id uuid primary key default gen_random_uuid(),
  proposition_id uuid not null references public.proposition_cards(id) on delete cascade,
  doctrine_node_id text not null,
  link_type text not null default 'candidate',
  authority_role text,
  confidence numeric(5,4),
  linking_method text not null default 'manual',
  review_status text not null default 'machine_candidate',
  reviewed_by uuid,
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint proposition_node_links_confidence_range
    check (confidence is null or (confidence >= 0 and confidence <= 1)),
  constraint proposition_node_links_link_type_check
    check (link_type in ('candidate', 'supports', 'qualifies', 'distinguishes', 'context', 'overruled_warning')),
  constraint proposition_node_links_review_status_check
    check (review_status in ('machine_candidate', 'quote_candidate', 'quote_verified', 'paragraph_verified', 'source_verified', 'human_reviewed', 'answer_safe')),
  constraint proposition_node_links_unique
    unique (proposition_id, doctrine_node_id, link_type)
);

create index if not exists proposition_node_links_doctrine_confidence_idx
  on public.proposition_node_links (doctrine_node_id, confidence desc nulls last);

create index if not exists proposition_node_links_proposition_idx
  on public.proposition_node_links (proposition_id);

create index if not exists proposition_node_links_review_status_idx
  on public.proposition_node_links (review_status);

alter table public.proposition_node_links enable row level security;

comment on table public.proposition_node_links is
  'Human-reviewable links between maintained doctrine graph node IDs and paragraph-grounded proposition_cards.';
comment on column public.proposition_node_links.doctrine_node_id is
  'Stable graph ID such as tort_law_hk.negligence.duty_of_care.';
comment on column public.proposition_node_links.review_status is
  'machine_candidate until promoted by verification/human review; only human_reviewed or answer_safe should be treated as answer-safe.';

create or replace function public.set_proposition_node_links_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_proposition_node_links_updated_at on public.proposition_node_links;
create trigger set_proposition_node_links_updated_at
before update on public.proposition_node_links
for each row
execute function public.set_proposition_node_links_updated_at();
