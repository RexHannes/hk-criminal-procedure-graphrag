# Minimum HK Law Claude MVP

This document defines the minimum usable path from the current source-card scaffold to a cautious "Claude for HK law" experience.

The goal is not a chatbot that sounds confident. The goal is:

```text
licensed/public corpus
-> structured legal objects
-> vector + keyword retrieval
-> reranking and authority weighting
-> source-gated answer contract
-> reusable reviewed SOP/playbook cache
-> lawyer-review and eval loop
```

## Current Position

The repo now has the beginning of the source-card spine:

- source registry schemas and Supabase migrations;
- private-vault storage policy guards;
- paragraph and proposition card schemas;
- quote-exact validation for the inconsistent-pleadings vertical;
- form metadata records;
- answer contract/composer pattern;
- review queue endpoints;
- legal RAG pipeline reporting.

That is enough for a narrow source-backed pilot. It is not yet the full HK-law corpus/vector engine.

## MVP Gates

### Gate 1 - Corpus Input And Licence Controls

Required:

- public judgments and legislation can enter as public source records;
- licensed books, Atkin-style forms, firm precedents and textbooks enter private object storage only;
- public repo stores metadata, hashes, source IDs, field schemas and issue tags only;
- every raw source has `source_registry` metadata before parsing;
- every private source has tenant/firm visibility and a private vector namespace.

Status:

```text
Partial.
Source registry and private-vault policy exist.
The large HK case corpus and licensed-book ingestion run are not done.
```

Do not upload all books/forms for production answering until Gates 2-7 are also active.

### Gate 2 - Legal Parsing And Structured Processing

Required:

- cases split by paragraph with citation and pinpoint;
- legislation split by section/subsection;
- forms split into metadata, fields, trigger conditions and required facts;
- books split into private doctrine notes/chapter metadata, not public law;
- candidate propositions extracted from exact source text;
- quote validation rejects unsupported propositions.

Status:

```text
Partial.
The inconsistent-pleadings vertical has quote-checked sample public cases.
Full parser runs for large public judgments/books/forms are not yet production-scale.
```

### Gate 3 - Embedding And Vector Storage

Required:

- Qdrant collections for:
  - `hk_legal_paragraphs`
  - `hk_proposition_cards`
  - `hk_form_metadata`
  - `firm_private_templates`
- every vector payload carries metadata filters:
  - jurisdiction
  - source type
  - court level
  - issue tags
  - authority role
  - review status
  - answer layer status
  - visibility
  - firm ID
  - licence status
- private/licensed material goes only to private namespaces.

Status:

```text
Local dev green, production not green.
Qdrant local dev indexing works with local-hash embeddings. This proves plumbing,
not legal semantic quality. Production needs hosted Qdrant and a real embedding
provider/model.
```

Student Pack help:

```text
DigitalOcean credit can host a small Qdrant VM for public/demo source-card retrieval.
Do not use it for confidential or licensed private sources until tenant and secret
controls are ready.
```

### Gate 4 - Retrieval And Reranking

Required:

- query classification before retrieval;
- metadata filter first;
- hybrid retrieval: keyword + vector + graph/domain routing;
- reranking by legal issue, court hierarchy, currentness, authority role and paragraph verification;
- irrelevant source families filtered before rendering;
- raw scores and source filenames kept in a collapsed audit trail.

Status:

```text
Partial.
There is a deterministic source-gated reranker and answer composers.
Production hybrid retrieval with Qdrant/cross-encoder reranking is not yet done.
```

### Gate 5 - Authority Treatment And Source-Gated Answers

Required:

- distinguish holdings, applied principles, obiter, party submissions, procedural background, legislative text, forms, commentary and firm precedents;
- no paragraph/source card means no final legal proposition;
- party submissions must not be presented as law;
- textbooks/commentary are secondary/private support unless licensed and reviewed;
- answer contract controls sections, missing facts, excluded issues and form candidates.

Status:

```text
Partial-to-good for the first vertical.
Authority-role fields exist and the professional composer uses source cards, but most domains still need real source cards.
```

### Gate 6 - Review, Promotion And Evaluation

Required promotion path:

```text
machine_candidate
-> quote_verified
-> source_verified
-> lawyer_reviewed
-> answer_safe
```

Required evals:

- golden queries by domain;
- expected issues and forbidden issue families;
- required source-card support;
- form/document candidates;
- no unsupported propositions;
- no raw-score leakage in main answers.

Status:

```text
Partial.
Review queue and golden tests exist for the pilot. Broad domain eval coverage is not done.
```

### Gate 7 - Stored Retrieved Law / SOP Cache

Required:

- retrieval bundles are saved with source IDs, proposition IDs, form IDs, query hash and corpus fingerprint;
- generated legal answers are saved as source-fingerprinted snapshots;
- reviewed SOP/playbook outputs are reused until sources, review status or facts change;
- cached answers expire or downgrade when a source card is replaced, rejected or becomes stale;
- cache never upgrades a research-only answer into answer-safe.

Why this matters:

```text
The system should not regenerate everything from zero on every query.
It should reuse reviewed legal maps and SOP flows, while still checking source freshness and missing facts.
```

Status:

```text
Implemented for the pilot vertical.
Remote cache tables exist and the API writes/reuses retrieval bundles, legal answer
snapshots and SOP playbooks for the source-card vertical.
```

Student Pack help:

```text
Doppler / 1Password should manage cache/API/Qdrant/Supabase secrets before more
cloud deployment. Sentry/New Relic/Datadog can monitor cache misses, retrieval
failures and ingestion errors later.
```

## What Is Still Missing For "Minimum Usable HK Law Claude"

The minimum product is still missing:

- large public judgment ingestion, ideally a staged ladder rather than jumping straight to 200k cases;
- production semantic embeddings and hosted Qdrant/vector search;
- production hybrid retrieval/reranking;
- more verified source-card verticals;
- admin UI for review/promotion;
- source freshness and contradiction checks across domains;
- tenant-aware private book/form upload and indexing;
- production auth/secrets/observability around private-source access.

The GitHub Student Developer Pack infrastructure map is in:

```text
data/legal_ingest/mvp/github_student_pack_services.json
docs/github-student-pack-legal-rag.md
```

## Safe Upload Rule

Books and forms can be uploaded once private storage and source registry are configured, but they should not influence product answers until:

```text
source registered
-> parsed
-> chunked
-> quote/proposition validated
-> review queued
-> indexed into the correct namespace
-> retrieved through answer contract
-> cross-checked before output
```

Public judgments may become paragraph/proposition cards. Licensed books and firm forms should become private doctrine notes, issue-spotting aids, metadata and approved template references only unless the licence expressly allows broader use.
