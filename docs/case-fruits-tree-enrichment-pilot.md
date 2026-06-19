# Case Fruits Tree Enrichment Pilot

This pilot implements a narrow, safe version of:

```text
case paragraph -> proposition card -> existing doctrine node -> L4 case application -> L5 paragraph proof
```

It is deliberately limited to the `criminal_procedure_hk` bail section.

## What This Is

- A fixture-only bridge from case-graph proposition cards to existing criminal procedure doctrine nodes.
- A candidate evidence trail for viewer/API detail panels.
- A validation target for the future public-case ingestion workflow.

## What This Is Not

- Not bulk case scraping.
- Not a live 50/200/1000-case ingestion run.
- Not book ingestion.
- Not answer-safe law.
- Not a mechanism for vector matches to rewrite the maintained book/tree nodes.

## Layer Policy

```text
L0-L3: maintained book/tree doctrine and procedure structure
L4: case application/scenario candidate enrichment
L5: paragraph proof / exact quote candidate evidence
```

L4/L5 records are displayed as candidate evidence only. They must remain:

```text
review_status = machine_candidate
answer_layer_status = candidate_only
human_review_required = true
```

until quote/source/lawyer review promotes them.

## Files

```text
data/legal_ingest/criminal_evidence_tree_v1/bail_pilot/
  pilot_manifest.json
  node_mapping.json
  proposition_node_links.json
  l4_case_applications.json
  l5_paragraph_proof.json
  case_fruits_artifact.json
```

`api/doctrine-evidence.js` and `api/search-evidence.js` may use these local records as candidate-only fallback evidence when Supabase has no reviewed evidence for the same doctrine node.

## Safety Rules

- Only public-demo fixture evidence is allowed.
- Private/licensed sources are blocked.
- Bulk auto-attachment is blocked.
- Links must point to existing `criminal_procedure_hk` doctrine node IDs.
- Supporting quotes must be found in the stored paragraph fixture.
- No item may be marked `answer_safe`.

## Next Real Step

Replace the fixture with a small public-case bail batch:

```text
10-20 public bail cases
-> paragraph cards
-> proposition cards
-> proposition_node_links as machine_candidate
-> L4/L5 pilot detail panels
-> review queue
```

Do not scale to 200+ cases until the first batch shows clean attachment quality.
