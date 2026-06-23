# NotebookLM Tree Proposal Workflow

This repository can use a logged-in NotebookLM notebook as a private, candidate-only tree proposer for no-tree cases.

NotebookLM is not an authority layer. It may suggest doctrine structure, issue tags, landmark cases, and lineage. Because the user’s NotebookLM contains the curated private library, it is the preferred **big-picture candidate tree / lineage source** for no-tree branches.

DeepSeek may be used only as a secondary seed generator for candidate landmark cases, search terms, or extraction-rule drafts. DeepSeek output is expected to hallucinate sometimes, so it must remain `llm_unverified_seed` until public-source lookup and exact-quote verification succeed.

The backend only accepts public-source case fruits after LegalRef/HKLII/Judiciary quote validation.

## Flow

```text
case miner
→ existing tree match
→ if matched: attach quote-verified fruits as machine_candidate
→ if no clean branch: tree_gap_candidate
→ ask NotebookLM for candidate tree / lineage
→ optionally ask DeepSeek for extra candidate case seeds/search terms
→ normalize candidate tree
→ verify candidate cases exist on public allowlisted sources
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
DeepSeek output: llm_unverified_seed
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

## Second Pilot

The second pilot demonstrates the DeepSeek-secondary workflow:

```text
Topic: unlawful assembly / riot / joint enterprise / physical presence
Seed source: DeepSeek candidate branch/case proposal
Accepted public case: Secretary for Justice v Tong Wai Hung and Others [2021] HKCA 404
Public source: LegalRef DIS=134508
```

DeepSeek was used only to suggest the branch/case direction. The case fruits were accepted only after LegalRef fetch and exact-quote validation.

Generated artifacts:

```text
data/legal_domain_packs/demo_maps/criminal_law_hk/nodes/10_public_order_riot.json
data/legal_domain_packs/demo_maps/criminal_law_hk/edges/10_public_order_riot.json
data/legal_ingest/criminal_evidence_tree_v1/tree_gap_pilots/public_order_riot_v1/
```
