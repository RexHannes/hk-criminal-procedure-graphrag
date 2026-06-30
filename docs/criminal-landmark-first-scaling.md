# Criminal Landmark-First Scaling

This document records the safe path for growing criminal law/procedure case fruits.

The system must not start with a 10,000-case crawler. It starts with the maintained tree and fills public, paragraph-proved landmark fruits branch by branch.

## Current Gate Result

The 10,000-case preflight is blocked by design:

```bash
node scripts/validate_case_scale_readiness.js --target-cases 10000
node scripts/plan_case_scale_run.js --target-cases 10000
```

Current blockers:

```text
production_embeddings_configured
production_reranker_configured
durable_orchestration_configured
bail_gold_review_set_exists
```

The allowed work is branch-level expansion.

## Current Coverage

Generate the coverage and priority queue:

```bash
node scripts/build_criminal_landmark_expansion_queue.js
node scripts/validate_criminal_landmark_expansion_queue.js
```

Output:

```text
data/legal_ingest/criminal_evidence_tree_v1/landmark_first_expansion_queue.json
```

As of the first queue:

```text
criminal law/procedure tree nodes: 371
doctrine/procedure branch nodes: 186
nodes with candidate fruits: 18
queued doctrine/procedure nodes without fruits: 170
```

Existing populated batches:

```text
bail_pilot
criminal_bail_public_batch_v1
public_order_riot_tree_gap_pilot_v1
sedition_public_expression_tree_gap_pilot_v1
```

## Recommended Next Branch Families

Use the queue rather than guessing. Current top branch families:

```text
1. investigation_arrest_search_detention
2. theft_dishonesty_fraud
3. public_order_riot_unlawful_assembly
4. trial_no_case_jury_directions
5. appeals_reviews_sentence
6. offences_against_person
7. bribery_corruption_misconduct
8. aml_money_laundering
```

## NotebookLM / DeepSeek Roles

NotebookLM:

```text
candidate tree, landmark case and lineage proposer only
```

DeepSeek:

```text
secondary case-seed or extraction-rule proposer only
```

Neither can create authority. A case fruit is accepted only after:

```text
case lead
-> public LegalRef/HKLII/Judiciary lookup
-> paragraph extraction
-> exact quote validation
-> proposition card
-> doctrine_node_id link
-> review queue
```

## Branch Run Shape

For each queued branch family:

```text
1. Pick one branch family from landmark_first_expansion_queue.json.
2. Ask NotebookLM for 10-20 landmark cases / lineage for that branch.
3. Ask DeepSeek only for secondary case leads or extraction-rule drafts if needed.
4. Deduplicate against existing source IDs, citations, URLs and LegalRef DIS/HKLII IDs.
5. Fetch only public judgments.
6. Extract only exact paragraph proof.
7. Attach only to existing doctrine_node_id values, or create candidate_tree_seed nodes if the tree is genuinely missing.
8. Store as machine_candidate / candidate_only.
9. Add API routing regression for that branch.
10. Reviewer spot-checks before expanding beyond 20 branch cases.
```

## What Not To Do

Do not:

```text
run 10,000 cases while readiness is blocked
let DeepSeek hallucinated citations enter source cards
copy NotebookLM private text into public artifacts
attach vector-only hits to doctrine nodes
overwrite an existing lineage when a later case contradicts it
auto-promote anything to answer_safe
```

Contradictory or limiting cases should be stored as:

```text
lineage_note
treatment_note
dissent_or_limitation_candidate
```

with exact paragraph proof and review queue entry.
