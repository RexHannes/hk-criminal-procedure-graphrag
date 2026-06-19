# Public Bail Case Batch v1

This batch is the first real-public-source extension of the criminal procedure case-fruits pilot.

It is intentionally narrow:

- domain: `criminal_procedure_hk`
- topic: bail / NSL bail
- source type: public Judiciary Legal Reference judgments only
- output status: `machine_candidate` / `candidate_only`
- review gate: human review required before answer-safe use
- current scale rung: 8 public judgments / 35 quote-checked propositions
- next scale rung: 20-50 public bail judgments only after review/eval gates pass

## Files

```text
data/legal_ingest/criminal_evidence_tree_v1/bail_public_batch_v1/
├─ source_manifest.json
├─ extraction_rules.json
├─ paragraph_cards.json
├─ proposition_cards.json
├─ proposition_node_links.json
├─ l4_case_applications.json
├─ l5_paragraph_proof.json
├─ parse_report.json
└─ case_fruits_artifact.json
```

## Commands

Build from public sources:

```bash
node scripts/build_public_bail_batch.js
```

Validate the batch:

```bash
node scripts/validate_public_bail_batch.js
node scripts/validate_case_fruits_api_fallback.js
```

Seed Supabase (legacy Case project schema; keeps `machine_candidate` / no answer-safe promotion):

```bash
node scripts/seed_public_bail_batch_supabase.js --dry-run
node scripts/seed_public_bail_batch_supabase.js
```

Index precise paragraph/proposition vectors in local Qdrant:

```bash
node scripts/index_public_bail_batch_qdrant.js --dry-run
node scripts/index_public_bail_batch_qdrant.js
```

Promote to answer-safe only through the review API after human quote/source review:

```bash
curl -X POST "$APP_BASE_URL/api/legal-ingest/review/<proposition_id>/approve" \
  -H "Authorization: Bearer $LEGAL_REVIEW_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"promote_answer_safe": true, "reviewed_by": "lawyer_reviewer"}'
```

Verify backend storage and retrieval isolation:

```bash
node scripts/validate_public_bail_backend_storage.js
node scripts/validate_public_bail_qdrant_retrieval.js
```

## Safety Rules

The builder only emits a proposition when:

- the source is listed in `source_manifest.json`;
- the paragraph number is found in the fetched public source;
- the rule's `exact_quote` appears in the extracted paragraph text;
- the target doctrine node exists;
- the resulting proposition remains `machine_candidate`;
- the resulting evidence remains `candidate_only`.

The batch must not:

- ingest private, textbook, firm, or licensed material;
- write raw downloaded source files to the repo;
- bulk-attach cases across criminal law;
- mark any proposition as `answer_safe`;
- rewrite L0-L3 doctrine nodes.
- exceed the manifest `scale_policy.max_sources_without_force` gate;
- move to another criminal-law section until the bail review pass rate and golden-query tests are acceptable.

## Lineage Note

`Tong Ying Kit v HKSAR` and the CFI bail decisions in `HKSAR v Tong Ying Kit`, `HKSAR v Ma Chun Man`, and `HKSAR v Lai Chee Ying` are included as candidate public-source lineage. `HKSAR v Lai Chee Ying` in the CFA later corrected/limited the earlier Tong treatment on the NSL Article 42(2) threshold, so answer composers and reviewers should prefer the CFA lineage when presenting the current source trail.
