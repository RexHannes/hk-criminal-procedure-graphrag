# Hong Kong Criminal Procedure — GraphRAG Map

A structured knowledge graph covering every procedural stage of Hong Kong criminal procedure, from jurisdiction to final appeal, with embedded case seeds and statutory anchors.

## Purpose

This is a **legal issue checklist / doctrine map / case map** for Hong Kong criminal procedure. It is designed as a visual navigator for:
- **Law students & PCLL students** studying criminal procedure
- **Practitioners** needing quick issue identification
- **AI/GraphRAG retrieval** — the graph provides structured node-level metadata for safe, verified legal answering

## Status

| Flag | Value |
|------|-------|
| `not_product_answer_layer` | `true` — this is a knowledge skeleton, not a legal answer engine |
| `needs_hklii_verification` | `true` — all case seeds need HKLII paragraph anchor verification |
| `authority_status` | `unverified_case_seed` — cases are seeds only, not verified sources |

**This map does not constitute legal advice.**

## Structure

```
hk-criminal-procedure-graphrag/
├── README.md
├── scripts/
│   └── validate_tree_view_data.py   # Data integrity validator
├── viewer/
│   ├── index.html                   # Three-panel tree viewer
│   ├── viewer.js                    # Tree model, renderer, flow player
│   └── styles.css                   # Tree cards, branch rails, dark theme
└── data/
    ├── index.json
    └── legal_domain_packs/
        └── demo_maps/
            └── criminal_procedure_hk/
                ├── domain.json              # Domain metadata
                ├── consolidated.json        # Manifest
                ├── nodes/                   # 12 section node files
                │   ├── 01_jurisdiction.json
                │   ├── 02_investigation_arrest_search_detention.json
                │   ├── 03_pre_trial_disposition.json
                │   ├── 04_bail.json
                │   ├── 05_indictments.json
                │   ├── 06_cfi_trial.json
                │   ├── 07_dc_transferred_cases.json
                │   ├── 08_vulnerable_witnesses.json
                │   ├── 09_appeals_reviews.json
                │   ├── 10_costs_compensation.json
                │   ├── 11_practice_directions.json
                │   └── 12_nsl_submap.json
                ├── edges/                   # 12 edge files
                └── flows.json               # 6 procedural flow chains
```

## Sections

| # | Section | Key Nodes |
|---|---------|-----------|
| 01 | Criminal Legal System and Jurisdiction | Territorial jurisdiction, court hierarchy, constitutional limits, NSL |
| 02 | Investigation, Arrest, Search and Detention | Reasonable suspicion, arrest (with/without warrant), search, seizure, detention, bail |
| 03 | Initiation and Pre-Trial Disposition | Modes of initiation, offence classification, committal, stay, time limits |
| 04 | Bail | Right to bail, refusal grounds, factors, pending appeal, variation |
| 05 | Indictments and Charge Sheets | Drafting, duplicity, joinder/severance, amendment, quashing, plea |
| 06 | CFI Trial Procedure | Judge and jury, arraignment, no-case submission, summing up, verdict |
| 07 | District Court Transferred Cases | Transfer, dismissal application, trial by judge alone |
| 08 | Vulnerable Witnesses | Children, mentally incapacitated, sexual offence complainants, live link |
| 09 | Appeals, Reviews and Questions of Law | Conviction/sentence appeal, SJ reference, CFA jurisdiction, PD 4.2 |
| 10 | Costs, Compensation and Post-Trial Orders | Costs orders, compensation, restitution, post-sentence orders |
| 11 | Practice Directions (Seed References) | PD 4.2, 9.2, 9.5, 11.1, 12.1, 15.1 |
| 12 | Restricted NSL Submap | NSL bail, designated judges, no jury, overseas lawyers, surveillance |

## Node Types

| Type | Color | Meaning |
|------|-------|---------|
| `legal_issue` | Blue | Legal principle, test, or rule |
| `statute` | Green | Legislative reference (Cap. XXX s.XX) |
| `case_seed` | Purple | Case name with neutral citation (unverified) |
| `flow_step` | Orange | Step in a procedural flow chain |
| `practice_direction` | Teal | Practice Direction reference |
| `restricted_nsl` | Red | NSL-specific procedural deviation |
| `section_header` | Grey | Section grouping node |
| `gap` | Grey | Missing/unverified item (not yet populated) |

## Procedural Flows

6 directional flow chains are defined in `flows.json`:

1. **Arrest/Detention Flow** (6 steps) — identify power → reasonable suspicion → arrest → inform grounds → detention → charge/release
2. **Bail Flow** (7 steps) — arrest/charge → route → right to bail → refusal grounds → conditions → breach → variation/appeal
3. **Stay Flow** (6 steps) — identify abuse → fair trial possible? → exceptional circumstances → burden → remedy → appeal
4. **Indictment Flow** (8 steps) — institution → classification → drafting → particulars → filing → amendment → plea → trial
5. **CFI Trial Flow** (8 steps) — allocation → jury → arraignment → prosecution case → no-case → defence → summing up → verdict
6. **Appeal Conviction Flow** (7 steps) — conviction → notice → leave → perfected grounds → unsafe test → proviso → costs

## How to View

### Option 1: Serve locally (recommended)
```bash
python3 -m http.server 8080
```
Then open http://localhost:8080/viewer/

### Option 2: Open directly
Open `viewer/index.html` in your browser.
**Note:** Some browsers block `fetch()` from `file://` URLs. If the graph doesn't load, use Option 1.

## Viewer Architecture

The viewer uses a **tree-as-projection, graph-as-truth** model:

- **Tree for navigation** — the default view is an expandable doctrine/procedure tree with branch rails and card-based nodes
- **Graph for truth** — the underlying JSON data still preserves cross-links, statutory anchors, case seeds, flow transitions, and future authority/treatment edges

The tree is rendered from the same flat node/edge files — nothing is deleted. The tree is a navigational projection of the graph.

## Three-Panel Layout

```
┌─────────────────────────────────────────────────────┐
│ Header: badges, search, node-type legend            │
├─────────┬─────────────────────────┬─────────────────┤
│ Left    │ Center                  │ Right           │
│ Panel   │ Expandable Tree         │ Detail / Audit  │
│         │                         │ Panel           │
│ • Seed  │ L0: Domain root         │                 │
│   layer │ L1: Section headers     │ • Type badge    │
│   warn  │ L2: Legal issues        │ • Status flags  │
│ • Type  │ L3: Sub-issues/flow     │ • Summary       │
│   filters│ L4–L5: Expandable       │ • Statute refs  │
│ • Depth │    (hidden by default)  │ • Case seeds    │
│   control│                         │ • Practice dirs │
│ • Flow  │ Branch rails +          │ • Cross-refs    │
│   player│ elbow connectors        │ • Case audit    │
│ • Section                         │ • Source proof  │
│   list  │                         │   placeholder   │
└─────────┴─────────────────────────┴─────────────────┘
└────────────────── Status Bar ───────────────────────┘
```

## Viewer Features

- **Expandable doctrine tree** — default view with card-based nodes, continuous branch rails, and elbow connectors
- **3-panel layout** — left sidebar (filters/depth/flow/sections), center (tree), right (detail/audit panel)
- **Search** — matches by label, summary, ID, statute refs, and case seeds; auto-expands ancestors
- **Support/audit search results** — statutes and case seeds stay out of the default visual tree, but remain searchable and clickable for audit-panel inspection
- **Type filters** — toggle visibility of legal issues, flow steps, statutes, case seeds, PDs, NSL nodes
- **Depth control** — show L0–L1 sections, L2 issues, or expand all to L3+
- **Flow player** — select a procedural flow and step through with play/pause/next/prev; highlights corresponding flow-step cards in collapsible per-section flow branches
- **Section navigation** — click a section in the left panel to expand and scroll to it using the section titles from `consolidated.json`
- **Detail panel** — click any tree card to see full metadata, statute references, case seeds, practice direction refs, and a future-proof Case Audit / Source Proof area
- **Safety badges** — every node shows its `not_product_answer_layer`, `needs_hklii_verification`, and `unverified_case_seed` status where applicable

## Visibility Levels

The tree supports 6 depth levels for future scalability:

| Level | Content | Default |
|-------|---------|---------|
| L0 | Domain root (Hong Kong Criminal Procedure) | Always visible |
| L1 | Major procedural sections (12 sections) | Always visible |
| L2 | Core issues / procedural stages | Default expanded |
| L3 | Sub-issues / tests / statutory branches | Hidden, expandable |
| L4 | Case applications / factual scenarios | Hidden, expandable |
| L5 | Paragraph proof / quote spans / treatment | Hidden, expandable |

L4–L5 are not yet populated — they are reserved for future HKLII case mining and paragraph-level verification.

## Validation

Run the data validation script to ensure data integrity:

```bash
python3 scripts/validate_tree_view_data.py
```

Checks performed:
- All node IDs are unique
- All edge from/to IDs resolve to existing nodes
- All statute_refs, case_seeds, and cross_refs resolve
- Every section has a section_header node
- No node loses its verification_status / authority_status / answer_layer_status
- Flow chain steps reference valid node IDs
- Primary `has_subtopic` navigation nodes are renderable in the tree
- Flow steps are renderable under section flow branches
- Support-only statute/case nodes remain linked for search/audit use

## Data Schema

### Node
```json
{
  "id": "bail_right_to_bail",
  "type": "legal_issue",
  "label": "Right to Bail",
  "summary": "Check statutory presumption and refusal grounds under Cap 221 s.9D.",
  "section": "04",
  "subsection": "04.01",
  "subtopic": "Right to Bail",
  "statute_refs": ["cap221_s9d"],
  "case_seeds": ["hksar_v_milne_john"],
  "verification_status": "needs_hklii_verification",
  "answer_layer_status": "not_product_answer_layer",
  "authority_status": "unverified_case_seed"
}
```

### Edge
```json
{
  "from": "bail_right_to_bail",
  "to": "cap221_s9d",
  "relationship": "statutory_anchor"
}
```

## Tree vs Graph Model

This design uses **tree for navigation, graph for truth**:

- The **visible default UI** is a clean expandable tree, not a scattered force-directed graph
- The **underlying data** still preserves all cross-links, statutory anchors, case seeds, flow transitions, and future authority/treatment edges
- **Statutes, case seeds, practice directions, and future source proofs** appear mainly in the detail/audit panel, not as random visible dots
- The tree is a **navigational projection** of the underlying graph — no data is lost
- Support-only nodes (statutes, cases, PDs) remain searchable and auditable

## Future Integration

This map is designed for eventual merger into Casemap4/Casemap5:

```
Layer 1: Doctrine skeleton    ← you are here
  → issue map, legal checklist, statutes, case seeds, gaps
  → stable textbook/legal structure

Layer 2: Proposition layer
  → precise legal statements, each with scope and status

Layer 3: Authority layer
  → cases, statutes, textbook sources, court level, treatment relationships

Layer 4: Proof/audit layer
  → exact paragraph/page anchors, quote spans, extraction log, verification history
```

## Doctrine/Evidence Bridge

The repository now includes a first bridge milestone for connecting the static
doctrine maps to a future Casemap4/Supabase evidence backend. This is still not
an answer layer and it does not ingest all HK cases by itself.

Bridge scripts:

```bash
# Export stable doctrine nodes from all domain packs
python3 scripts/export_doctrine_nodes.py --dry-run

# Validate paragraph-grounded proposition links
python3 scripts/validate_evidence_links.py \
  --evidence data/evidence/example_evidence_bridge.json

# Return the safe query -> doctrine nodes -> evidence trace response shape
python3 scripts/search_evidence_trace.py \
  "dishonesty theft actual knowledge" \
  --evidence data/evidence/example_evidence_bridge.json
```

The bridge intentionally keeps this split:

```text
static viewer = clean doctrine ontology browser
Casemap4/Supabase = cases, paragraphs, proposition cards and source proof
DeepSeek/LLM = candidate extractor only, never final verifier
```

The Vercel viewer calls the server-side evidence route when a doctrine node is
selected:

```text
GET /api/doctrine-evidence?node_id=<doctrine_node_id>
```

That route validates the node against the static domain packs, reads linked
evidence from Supabase only on the server side, and returns `no_evidence` rather
than failing when paragraph proof has not yet been synced. Case paragraphs should
appear in the right audit panel only through explicit proposition-node links,
not as extra nodes in the main tree.

The viewer also includes a first query-to-evidence trail route:

```text
GET /api/search-evidence?q=<legal question or issue>
```

It maps a natural-language query to candidate doctrine nodes, optionally asks
DeepSeek to rank those nodes when `DEEPSEEK_API_KEY` is configured server-side,
then attaches linked Supabase paragraph evidence where explicit
`proposition_node_links` exist. If DeepSeek is not configured, the endpoint
falls back to deterministic graph search and labels the response accordingly.
This is an audit trail, not a legal answer generator.

See `docs/casemap_doctrine_evidence_bridge.md` for the backend table contract,
validation rules and Supabase safety notes.

## License

Data is provided for educational and reference purposes. All statutory references and case citations should be independently verified against official sources (HKLII, e-Legislation, Judiciary website).
