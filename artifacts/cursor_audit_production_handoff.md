# Cursor Audit / Production Handoff

## Scope

This handoff covers the current HK criminal GraphRAG public-case expansion work in `/tmp/hk-graphrag-main-status`.

Do not push secrets. `.env.local` is intentionally ignored and contains local provider keys.

## New Candidate-Only Case Fruits

### Criminal Procedure: Investigation / Search / Seizure

- Artifact directory: `data/legal_ingest/criminal_evidence_tree_v1/tree_gap_pilots/investigation_search_seizure_v1/`
- Public sources: LegalRef only
- Cases: 2
- Paragraph cards: 10
- Proposition cards: 11
- Doctrine links: 25
- Answer-safe count: 0
- Qdrant vector scope: `investigation_search_seizure_tree_gap_pilot_v1`
- Practice area: `criminal_procedure`

### Criminal Law: Theft / Dishonesty / Fraud

- Artifact directory: `data/legal_ingest/criminal_evidence_tree_v1/tree_gap_pilots/theft_dishonesty_fraud_v1/`
- Public sources: LegalRef only
- Cases: 1
- Paragraph cards: 10
- Proposition cards: 10
- Doctrine links: 18
- Answer-safe count: 0
- Qdrant vector scope: `theft_dishonesty_fraud_tree_gap_pilot_v1`
- Practice area: `criminal_law`

## Scale Planning

- Plan: `data/legal_ingest/criminal_evidence_tree_v1/multibranch_expansion_plan_2500.json`
- 10k plan: `data/legal_ingest/criminal_evidence_tree_v1/multibranch_expansion_plan_10000.json`
- Discovery queue: `data/legal_ingest/criminal_evidence_tree_v1/multibranch_discovery_queue_2500.json`
- Target cases: 2500
- Estimated safe staged range: 2000-3000
- Branch families: 13
- Shards: 56
- Status: candidate-only plan, not bulk executed

10k status:

- Growth report: `artifacts/case_growth_10000_status.json`
- Investor recall policy: `data/legal_ingest/criminal_evidence_tree_v1/investor_recall/recall_tier_policy_10000.json`
- Investor recall cards: `data/legal_ingest/criminal_evidence_tree_v1/investor_recall/case_recall_cards.json`
- Investor recall registry: `data/legal_ingest/criminal_evidence_tree_v1/investor_recall/case_registry_public_v1.json`
- Investor recall Qdrant collection: `hk_case_recall_openrouter_2048`
- Current unique public case sources with artifacts: 31
- Current investor recall-only cards: 40
- Current investor recall HKLII-confirmed cards: 40
- Current investor recall HKLII paragraph URLs: 1,950
- Remaining to 10,000 verified case artifacts: 9,969
- 10k branch quota total: 10,000
- 10k multibranch shards: 205 shards of max 50 cases
- 10k execution run plan: `artifacts/case_scale_10000.json`
- 10k shard 1 preflight: `artifacts/case_scale_10000_shard_0001_preflight.json`
- Current 10k execution status: blocked for large-scale ingestion until production durable orchestration keys are configured.

## Required Checks Before Production Push

Run:

```bash
node scripts/validate_tree_gap_pilot.js --pilot investigation_search_seizure_v1
node scripts/validate_tree_gap_pilot.js --pilot theft_dishonesty_fraud_v1
node scripts/validate_criminal_landmark_expansion_queue.js
node scripts/validate_multibranch_case_expansion_plan.js
node scripts/validate_multibranch_case_expansion_plan.js --plan data/legal_ingest/criminal_evidence_tree_v1/multibranch_expansion_plan_10000.json
node scripts/validate_multibranch_discovery_queue.js
node scripts/validate_qdrant_legal_index.js
node scripts/validate_no_secrets_committed.js
node scripts/validate_tenant_filters.js
node scripts/validate_private_source_access.js
node scripts/validate_private_ingestion_blocked.js
node scripts/validate_source_gated_answer.js
node scripts/validate_source_gated_review_state.js
node scripts/validate_retrieval_quality_floor.js
node scripts/validate_retrieval_quality_floor.js --benchmark data/legal_ingest/criminal_evidence_tree_v1/retrieval_benchmark_criminal_pilots.json --collection hk_proposition_cards_openrouter_2048
node scripts/report_10k_case_growth_status.js
node scripts/validate_investor_recall_corpus.js --min-cards 40 --require-hklii-paragraph-urls
node scripts/validate_case_scale_readiness.js --target-cases 10000
node scripts/run_case_scale_shard.js --plan artifacts/case_scale_10000.json --shard-id shard_0001 --preflight-only --output artifacts/case_scale_10000_shard_0001_preflight.json
```

Expected caveat:

- The default MVP benchmark currently reports `hit_rate=0` with `insufficient_needs_more_corpus_or_better_retrieval` because it still expects older MVP civil samples, ordinances, and placeholder graph bundle IDs.
- The criminal-pilot benchmark reports `hit_rate=1` against the actual indexed LegalRef pilot proposition IDs.
- The old MVP red light is a benchmark/corpus-alignment gap, not a secret/leakage failure.
- `validate_case_scale_readiness.js --target-cases 10000` is expected to block until production durable orchestration is configured. Local `INNGEST_DEV=1` is no longer accepted for 10k execution.
- The investor recall tier is `case_recall_only`: LegalRef + HKLII paragraph-URL confirmed search cards, not answer-safe propositions.
- Do not market this as answer-safe 2500-case retrieval yet.

## Production-Separation Rules

- Keep criminal law/procedure material out of probate/civil/PI answer paths.
- Confirm every Qdrant payload has:
  - `source_visibility: public_demo`
  - `tenant_id: public`
  - `answer_layer_status: candidate_only`
  - `review_status: machine_candidate`
  - correct `domain_id`
  - correct `practice_area`
- No Lexis/private/NotebookLM text should appear in public source cards.
- NotebookLM and DeepSeek are proposal/lead tools only.
- No answer-safe promotion without human review.

## Current Cloud Qdrant Counts After This Run

- `hk_legal_paragraphs_openrouter_2048`: 112 points
- `hk_proposition_cards_openrouter_2048`: 114 points
- `hk_form_metadata_openrouter_2048`: 6 points

## Suggested Commit Message

```text
Add criminal public case-fruit pilots and multibranch expansion plan
```
