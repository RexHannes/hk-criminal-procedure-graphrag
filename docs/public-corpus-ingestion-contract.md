# Public Corpus Ingestion Contract

This contract governs `data/legal_ingest/public_corpus_v1` as a public-demo corpus.

## Source Metadata Requirements

Every public corpus source must include:

- `source_id`
- `source_kind`
- `source_visibility=public_demo`
- `tenant_id=public`
- `jurisdiction=HK`
- `title`
- `url_or_path`
- `citation_fields_required`
- `licence_status=public_or_demo_safe`
- `ingestion_status`

Private, client, licensed textbook, Atkin, paid database, or firm precedent sources are not allowed in the public corpus.

## Chunking Rules

- Cases must be paragraph-level.
- Ordinances and subsidiary legislation must be provision/rule-level.
- Practice directions must be paragraph or section-level.
- Public guides may be page/section-level and must be marked explanatory, not authority.
- Graph nodes and proposition-card metadata are not direct authority unless backed by source cards.

## Chunk Hash Rules

Each chunk must include:

- `chunk_id`
- `source_id`
- `chunk_hash`
- `source_visibility`
- `tenant_id`
- `citation` or source-specific citation fields
- `pinpoint` where available
- `review_state`
- `embedding_status`

`chunk_hash` should be SHA-256 over normalized source text plus source id and pinpoint. The current pilot manifest stores hashes for existing demo chunks; future ingestion should regenerate and verify them.

## Citation Field Requirements

Required citation fields are defined in `citation_requirements.json`.

Examples:

- case: `case_name`, `neutral_citation`, `paragraph`
- ordinance: `cap`, `section`
- subsidiary legislation: `cap`, `rule`
- practice direction: `practice_direction_no`, `effective_date`
- public guide: `page_title`, `retrieved_at`
- proposition card: `source_card_ids`, `review_state`

## Visibility And Tenant Rules

Public demo retrieval may use only:

```json
{
  "source_visibility": "public_demo",
  "tenant_id": "public"
}
```

Any other visibility or tenant id blocks public corpus validation.

## Review and Promotion

Public corpus chunks and proposition cards move through this lifecycle:

```text
machine_candidate -> quote_verified -> source_verified -> lawyer_reviewed -> answer_safe
```

Only `answer_safe` material may support final legal propositions without a human-review warning. Earlier states remain useful for research, retrieval smoke tests, and source-audit display, but the answer composer must mark them as requiring review.

## Ingestion Blocks

Ingestion is blocked if:

- source kind is private/licensed;
- visibility is not `public_demo`;
- tenant id is not `public`;
- citation requirements are missing;
- official/current source cannot be verified;
- source licence/status is not public or demo-safe.

## Answer Generation Blocks

Answer generation is blocked or downgraded if:

- no source card was retrieved;
- a source has no citation/pinpoint where required;
- the chunk is machine-only and not reviewed;
- the proposition is unsupported by an exact quote;
- the answer would rely on private/licensed material in public mode.

No source card means no final legal proposition.
