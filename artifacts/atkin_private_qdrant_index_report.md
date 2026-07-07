# Atkin Private Qdrant Index Report

Generated: 2026-07-07T00:00:00+08:00

## Summary

| Metric | Value |
|---|---:|
| Local source present | yes |
| Private stores scanned | 68 |
| Real templates detected | 2014 |
| Real clause chunks detected | 14487 |
| Dry run | yes |
| Real templates approved for Qdrant | 0 |
| Real clause chunks approved for Qdrant | 0 |
| Redacted fixture used for payload-shape check | yes |
| External embedding services used | no |

## Collections

- Templates: `hk_private_form_templates_local_private_form_tenant_atkin_forms_workspace`
- Chunks: `hk_private_form_chunks_local_private_form_tenant_atkin_forms_workspace`

## Retrieval Contract

- Tenant/workspace filters are mandatory.
- Payloads are `source_visibility=private_form` and `part_layer=part_2_forms`.
- Structured filters and blockers run before private Qdrant semantic search.
- Public legal collections remain separate.
- Real private templates remain inactive unless `review_status=approved` and `classification_status=review_approved`.

Private text committed: no.
