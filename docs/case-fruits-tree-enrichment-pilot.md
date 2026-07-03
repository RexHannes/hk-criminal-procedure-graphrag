# Case Fruits Tree Enrichment

Case paragraphs are linked to doctrine nodes with HKLII/LegalRef URLs and paragraph-level proof (L4 application + L5 quote).

## Layer Policy

```text
L0-L3: maintained doctrine / procedure structure
L4: case application linked to doctrine nodes
L5: paragraph proof with exact quotes from HKLII judgments
```

All public case fruits are presented as **HKLII-linked paragraph proof** in the viewer and API.

## Files

```text
data/legal_ingest/criminal_evidence_tree_v1/*/
  proposition_node_links.json
  l4_case_applications.json
  l5_paragraph_proof.json
  paragraph_cards.json
data/legal_ingest/case_seed_paragraph_proof.json
```

`api/doctrine-evidence.js` merges Supabase records with local quote-proof artifacts.

## Promotion

Run `node scripts/promote_verified_authorities.js` after adding new case fruits to stamp verified statuses and HKLII URLs across domain packs and ingest artifacts.
