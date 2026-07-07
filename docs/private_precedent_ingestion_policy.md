# Private Precedent Ingestion Policy

Private precedent packs must remain private. The repository may contain only schemas, source code, validators, reports, and synthetic fixtures.

## Prohibited In Git

- Real Atkins/licensed forms.
- Firm precedents and client forms.
- Extracted real template text.
- Private NotebookLM notes.
- Private output exports.
- ZIP/DOCX/PDF files from private sources.

## Gitignored Private Paths

Private inputs and outputs must live under private_uploads/, private_ingest_output/, private_templates/, private_exports/, and private_notebooklm_notes/ or equivalent private storage.

## Mandatory Upload Metadata

Every FormPack requires a sourceLicenseNote. If it is absent, ingestion fails. The note records the uploader's right to use the material in a private workspace; it does not permit public redistribution.

## Safe Committed Fixtures

Committed fixtures under fixtures/forms/ must be synthetic. They may mimic structure and field names but must not reproduce licensed wording.

## External LLM Use

NotebookLM, DeepSeek, or other LLMs may propose classifications or clause usage rules only for private workspace processing. Their outputs are INTERNAL_USAGE_NOTE or AI_SUGGESTED until reviewed. Private material must not be sent to an external service unless the user explicitly authorises that exact run and the environment is configured for private processing.
