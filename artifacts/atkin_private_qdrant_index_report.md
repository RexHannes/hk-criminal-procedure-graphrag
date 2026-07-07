# Atkin Private Qdrant Index Report

Generated: 2026-07-07T00:00:00+08:00

## Summary

| Metric | Value |
|---|---:|
| Local source present | no |
| Dry run | yes |
| Templates ready | 1 |
| Clause chunks ready | 1 |
| External embedding services used | no |

## Collections

- Templates: `hk_private_form_templates_local_private_form_tenant_atkin_forms_workspace`
- Chunks: `hk_private_form_chunks_local_private_form_tenant_atkin_forms_workspace`

## Retrieval Contract

- Tenant/workspace filters are mandatory.
- Payloads are `source_visibility=private_form` and `part_layer=part_2_forms`.
- Structured filters and blockers run before private Qdrant semantic search.
- Public legal collections remain separate.

Private text committed: no.
