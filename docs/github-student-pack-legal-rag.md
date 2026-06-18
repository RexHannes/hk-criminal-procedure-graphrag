# GitHub Student Developer Pack For The Legal RAG MVP

This repo can use Student Developer Pack benefits, but the safest rule is:

```text
Use credits for infrastructure, demos, public-law corpora and synthetic tests.
Do not use free/student cloud services for confidential legal/client materials
until terms, access controls and deletion/security behaviour are reviewed.
```

## Best Use Of The Pack

### 1. DigitalOcean

Use first for:

- a small Qdrant VM;
- legal-ingest FastAPI sidecar;
- public-demo backend;
- portfolio infrastructure.

Do not rely on the credit for excluded GPU/frontier-model/inference products. Keep private legal material out until access controls are implemented.

Suggested dev-to-demo path:

```text
local Qdrant smoke
-> DigitalOcean Qdrant VM
-> index public source-card corpus
-> attach API to hosted Qdrant
-> add monitoring
```

### 2. GitHub Pro And Codespaces

Use for:

- private repos;
- reproducible dev;
- pull request workflow;
- portfolio docs and demo branches.

This is useful for making the project credible without exposing private source material.

### 3. Clerk Or Appwrite

Use one auth path, not both at the same time.

Clerk is better if the product will become SaaS/B2B:

- user login;
- firm workspaces;
- future billing;
- organization membership.

Appwrite is useful if you want a beginner-friendly all-in-one backend:

- auth;
- database;
- file storage;
- serverless functions.

For the current Supabase-backed repo, Clerk is the cleaner add-on if you keep Supabase as storage/database.

### 4. Doppler / 1Password

Use before adding more cloud deployments:

- Supabase service key;
- Qdrant API key;
- embedding provider keys;
- review admin token;
- webhook secrets.

Never put service-role keys in browser code or public env vars.

### 5. Sentry / New Relic / Datadog

Add later for:

- API crashes;
- slow retrieval;
- failed ingestion jobs;
- Qdrant connectivity failures;
- unsupported-claim rates.

Not essential until the public demo is deployed.

### 6. Azure

Use after DigitalOcean unless there is a specific reason:

- enterprise CV signalling;
- App Service / Functions experiments;
- document processing experiments;
- possible Azure OpenAI only if access and pricing are suitable.

## What This Does Not Solve

The pack does not itself solve:

- licensed book permissions;
- 200k case ingestion;
- legal-quality embeddings;
- reranker quality;
- lawyer review;
- tenant-safe private source access.

It gives inexpensive infrastructure to build those layers.

## Current Repo Mapping

The service map lives at:

```text
data/legal_ingest/mvp/github_student_pack_services.json
```

Validation:

```bash
node scripts/validate_student_pack_services.js
```

## Recommended Next Move

Use the pack in this order:

```text
1. GitHub Pro/private repo/Codespaces
2. DigitalOcean small VM for hosted Qdrant
3. Doppler or 1Password for secrets
4. Clerk for user/workspace auth
5. Sentry for monitoring once demo is public
6. Azure/Appwrite only if a specific need appears
```

For now, keep copyrighted books/forms in a private local/Supabase vault only and use them as metadata/private-study candidates until review/licence controls are ready.

