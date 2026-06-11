# Evidence Bridge

This folder documents the JSON shape used by the doctrine/evidence bridge.
It is not a production evidence database. The production source of truth should
be Casemap4/Supabase or another server-side backend with verified paragraph
records.

The static viewer remains a doctrine browser:

```text
domain -> section -> issue -> principle
```

Cases, paragraphs, statutory sections and proposition cards belong in the
evidence layer and should be shown through an audit panel or search result
panel, not inserted as thousands of visible tree nodes.

## Status Rules

- DeepSeek or any LLM may only create `machine_candidate` or `quote_candidate`
  evidence.
- `answer_safe` requires verified source text, paragraph proof and human review.
- Static frontend code must not contain Supabase service-role keys.
- Candidate evidence should never be used for final legal reliance.

## Local Validation

```bash
python3 scripts/export_doctrine_nodes.py --dry-run
python3 scripts/validate_evidence_links.py --evidence data/evidence/example_evidence_bridge.json
python3 scripts/search_evidence_trace.py "What is the test for dishonesty?" \
  --evidence data/evidence/example_evidence_bridge.json
```

