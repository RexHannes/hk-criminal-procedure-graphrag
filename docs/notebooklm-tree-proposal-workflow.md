# NotebookLM Tree Proposal Workflow

This repository can use a logged-in NotebookLM notebook as a private, candidate-only tree proposer for no-tree cases.

NotebookLM is not an authority layer. It may suggest doctrine structure, issue tags, landmark cases, and lineage. The backend only accepts public-source case fruits after LegalRef/HKLII/Judiciary quote validation.

## Flow

```text
case miner
→ existing tree match
→ if matched: attach quote-verified fruits as machine_candidate
→ if no clean branch: tree_gap_candidate
→ ask NotebookLM for candidate tree / lineage
→ normalize candidate tree
→ fetch public cases
→ paragraph cards
→ exact quote validation
→ proposition cards
→ doctrine links
→ review queue
```

## Status Rules

```text
NotebookLM output: candidate_only_requires_public_source_verification
New tree nodes: candidate_tree_seed
Paragraph cards: quote_verified
Proposition cards: machine_candidate
Doctrine links: candidate_only
Human review: required
Answer-safe: never automatic
```

## Prompt Pattern

Use detailed prompts of this shape:

```text
Dear NotebookLM, can you propose a principle-sub-principle-issue-sub-issue-landmark cases and development tree for <topic>?

Please include:
- topic;
- principles;
- sub-principles;
- issues;
- sub-issues;
- landmark cases;
- development / lineage at each step;
- statutory anchors;
- uncertainty and verification notes.
```

Then convert the output into repo artifacts, but do not copy private book passages into public data.

## First Pilot

The first pilot is:

```text
Topic: sedition / public-order expression offences
Case: HKSAR v Tam Tak Chi [2024] HKCA 231
Public source: LegalRef DIS=158600
```

Generated artifacts:

```text
data/legal_domain_packs/demo_maps/criminal_law_hk/nodes/09_sedition_public_expression.json
data/legal_domain_packs/demo_maps/criminal_law_hk/edges/09_sedition_public_expression.json
data/legal_ingest/criminal_evidence_tree_v1/tree_gap_pilots/sedition_public_expression_v1/
```

The pilot remains candidate-only and requires review before product-answer use.
