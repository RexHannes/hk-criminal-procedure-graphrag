# Legal Ingest Service

Phase 1 sidecar for the HK GraphRAG app.

This service is intentionally separate from the existing Vercel query app. Its
job is to turn raw legal materials into structured legal objects before they are
eligible for retrieval:

1. source registry record
2. private vault object
3. parsed legal units
4. candidate proposition cards
5. validation report / human review queue
6. SQL + Qdrant index payloads

The public repository must not contain raw proprietary books, firm precedents,
or private form wording. Public files may contain schemas, metadata, hashes,
field schemas, issue mappings, and validation reports.

Runtime dependencies such as FastAPI, Inngest, Qdrant, Supabase, and LlamaIndex
are adapter boundaries for production. The Phase 1 validators use only the
Python standard library so the repo remains easy to smoke test.
