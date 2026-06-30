# Repeatable Branch Fruit Pipeline

This is the cross-domain workflow for growing a legal tree with public, paragraph-proved case fruits.

It is designed for accuracy before scale. NotebookLM and DeepSeek can propose structure or leads, but only public-source lookup and exact quote validation can create backend evidence.

## Contract

```text
field or branch candidate
-> existing tree match first
-> NotebookLM candidate tree if no clean branch exists
-> optional DeepSeek case-name/search-term leads
-> public source lookup
-> exact paragraph extraction
-> quote validation
-> proposition card
-> doctrine_node_id link
-> L4 case application / L5 paragraph proof
-> review queue
-> inquiry/API regression
```

## Authority Policy

```text
NotebookLM output: candidate tree / branch proposal only
DeepSeek output: llm_unverified_seed only
Public judgment paragraph: source material after URL + paragraph verification
Proposition card: machine_candidate until reviewed
Doctrine link: candidate_only until reviewed
Answer-safe: never automatic
```

Do not copy private book passages, form bodies, or NotebookLM source excerpts into public repo artifacts. Keep only candidate labels, issue maps, routing keywords, and public-source case leads.

## Standard Artifact Shape

Each branch pilot should write a directory under:

```text
data/legal_ingest/tree_gap_pilots/<branch_id>/
```

with:

```text
source_manifest.json
paragraph_cards.json
proposition_cards.json
proposition_node_links.json
l4_case_applications.json
l5_paragraph_proof.json
review_queue.json
case_fruits_artifact.json
parse_report.json
```

Every proposition must satisfy:

```text
exact_quote is present in paragraph_text
paragraph has public source URL
target doctrine_node_id exists
review_status = machine_candidate
answer_layer_status != answer_safe
review_queue item exists
```

If a good case lead lacks a precise paragraph, reject it into `parse_report.rejected` with a reason such as `paragraph_pinpoint_pending`. Do not quietly include it.

## Current Repeatable Pilots

### Data Privacy / DPP1

```bash
python3 scripts/build_data_privacy_gap_pilot.py
node scripts/validate_data_privacy_gap_pilot.js
node scripts/validate_data_privacy_inquiry_api.js
```

Artifact:

```text
data/legal_ingest/tree_gap_pilots/data_privacy_dpp1_v1/
```

### Civil Procedure / Inconsistent Positions

```bash
node scripts/build_civil_procedure_inconsistent_pleadings_pilot.js
node scripts/validate_civil_procedure_gap_pilot.js
node scripts/validate_civil_procedure_inquiry_api.js
```

Artifact:

```text
data/legal_ingest/tree_gap_pilots/civil_procedure_inconsistent_pleadings_v1/
```

The DP World/Henderson candidate is intentionally rejected until an exact paragraph pinpoint is added.

## Scale Ladder

Use this ladder for each new branch:

```text
1 branch
-> 3-5 public cases
-> API routing regression
-> reviewer spot-check
-> 10-20 public cases
-> retrieval/rerank evaluation
-> next branch
```

Do not run broad 20k-case ingestion from a new branch unless the scale-readiness gates are green:

```bash
node scripts/validate_case_scale_readiness.js --target-cases 20000
```

## Anti-Mixing Rules

Each branch needs an arbiter/routing regression asserting:

```text
selected domain is correct
expected domain pack appears
neighbor domains are absent
source evidence has paragraph proof
wrong-domain trigger words do not appear
```

Examples:

```bash
node scripts/validate_legal_domain_arbiter.js
node scripts/validate_inquiry_domain_routing.js
node scripts/validate_civil_procedure_inquiry_api.js
node scripts/validate_data_privacy_inquiry_api.js
```

## Reviewer Promotion

Promotion is a separate human/legal review act:

```text
machine_candidate
-> quote_verified
-> source_verified
-> lawyer_reviewed
-> answer_safe
```

This pipeline only reaches candidate/source-linked demo status. It must not auto-promote propositions or forms into final legal advice.
