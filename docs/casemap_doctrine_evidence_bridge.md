# Casemap Doctrine Evidence Bridge

This repository is the doctrine/domain-map viewer. It should not become the
case database. The backend proof engine should remain Casemap4/Supabase or an
equivalent server-side database.

## Architecture

```text
User question
  -> detect legal field
  -> match doctrine nodes from the static domain packs
  -> retrieve proposition cards linked to those nodes
  -> retrieve exact cases and paragraph text
  -> rank by court, role, verification status, treatment and recency
  -> return answer draft plus evidence trace or abstain
```

The visible trace should be evidence based, not uncontrolled chain-of-thought:

```text
detected domains
matched doctrine nodes
retrieved propositions
case / paragraph / quote proof
warnings and abstention status
```

## Supabase Tables

The SQL below is a contract for Casemap4/Supabase. It is not automatically
applied by this static viewer repository.

```sql
create table doctrine_nodes (
  doctrine_node_id text primary key,
  source_node_id text not null,
  domain_id text not null,
  parent_doctrine_node_id text references doctrine_nodes(doctrine_node_id),
  title text not null,
  node_type text not null,
  area_of_law text not null,
  topic text,
  issue text,
  path jsonb not null default '[]'::jsonb,
  verification_status text not null,
  answer_layer_status text not null,
  authority_status text not null,
  human_review_status text not null default 'unreviewed',
  imported_at timestamptz not null default now()
);

create table legal_cases (
  case_id text primary key,
  case_name text not null,
  neutral_citation text,
  court text,
  court_level text,
  judgment_date date,
  source_url text not null,
  legal_domain text,
  review_status text not null default 'unreviewed',
  good_law_flags jsonb not null default '[]'::jsonb,
  treatment_warnings jsonb not null default '[]'::jsonb
);

create table legal_paragraphs (
  paragraph_id text primary key,
  case_id text not null references legal_cases(case_id),
  para_no text not null,
  text text not null,
  text_hash text not null,
  source_url text not null,
  role_label text,
  review_status text not null default 'unreviewed',
  unique (case_id, para_no)
);

create table proposition_cards (
  proposition_id text primary key,
  case_id text not null references legal_cases(case_id),
  paragraph_span text[] not null,
  supporting_quote text not null,
  candidate_proposition text not null,
  paragraph_role text not null,
  verification_status text not null default 'machine_candidate',
  answer_layer_status text not null default 'not_product_answer_layer',
  human_review_status text not null default 'unreviewed'
);

create table proposition_doctrine_links (
  id text primary key,
  proposition_id text not null references proposition_cards(proposition_id),
  doctrine_node_id text not null references doctrine_nodes(doctrine_node_id),
  link_type text not null,
  authority_role text not null default 'candidate',
  confidence numeric not null default 0,
  verification_status text not null default 'machine_candidate',
  answer_layer_status text not null default 'not_product_answer_layer',
  human_review_status text not null default 'unreviewed',
  reason text,
  created_at timestamptz not null default now()
);
```

## Security Rules

- Enable RLS on tables exposed through Supabase Data API.
- Do not expose service-role keys in the viewer, GitHub, Vercel public env, or
  generated JSON.
- Prefer a server/API route for search orchestration.
- Public/anon access, if enabled, must be read-only and limited.

## Local Bridge Commands

```bash
python3 scripts/export_doctrine_nodes.py --output artifacts/doctrine_nodes/doctrine_nodes.json

python3 scripts/validate_evidence_links.py \
  --evidence data/evidence/example_evidence_bridge.json

python3 scripts/search_evidence_trace.py \
  "dishonesty theft actual knowledge" \
  --evidence data/evidence/example_evidence_bridge.json
```

## Current Limit

This bridge does not ingest all HK cases. It creates the deterministic import,
validation and search/audit shape needed before large-scale HKLII/Casemap4
ingestion.

