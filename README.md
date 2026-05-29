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
data/legal_domain_packs/demo_maps/criminal_procedure_hk/
├── domain.json              # Domain metadata and color scheme
├── consolidated.json        # Manifest linking all section files
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
├── edges/                   # 12 edge files (mirroring nodes)
└── flows.json               # 7 procedural flow chains
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

7 directional flow chains are defined in `flows.json`:

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

## Viewer Features

- **Interactive graph** — force-directed layout, drag, zoom, click
- **Section tree** — click a section to highlight its nodes
- **Search** — filter nodes by keyword (label, summary, or ID)
- **Flow player** — select a procedural flow and step through with play/pause/next/prev
- **Detail panel** — click any node to see its metadata, statute refs, case seeds, verification status
- **Status bar** — total nodes, edges, verified/unverified counts

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

## Future Integration

This map is designed for eventual merger into Casemap4:

```
Layer 1: Flow graph     ← you are here
  → issue map, legal checklist, statutes, case seeds, gaps

Layer 2: Verification layer
  → HKLII paragraphs, e-Legislation sections, authority status

Layer 3: Answer layer
  → only uses verified nodes, cites exact paragraphs, warns on skeletons
```

## License

Data is provided for educational and reference purposes. All statutory references and case citations should be independently verified against official sources (HKLII, e-Legislation, Judiciary website).
