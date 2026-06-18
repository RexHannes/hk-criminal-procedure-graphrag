# Doppler / 1Password Secrets Workflow

Use Doppler as the runtime source of truth for deployment secrets. Use 1Password for personal backup/storage of emergency credentials and service-token records.

Do not commit runtime env files.

## Required Runtime Secrets

```text
QDRANT_API_KEY
DEMO_DOMAIN
CLERK_ENABLED
CLERK_SECRET_KEY
CLERK_JWT_KEY
CLERK_AUTHORIZED_PARTIES
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
PRIVATE_SOURCE_INGESTION_ENABLED
PUBLIC_DEMO_MODE
```

Optional observability:

```text
SENTRY_DSN
NEW_RELIC_LICENSE_KEY
DATADOG_API_KEY
```

## Render Runtime Env

On the server/operator machine:

```bash
cd infra/digitalocean
export DOPPLER_TOKEN=dpl_xxx
./render_env_from_doppler.sh
```

This creates:

```text
infra/digitalocean/.env.demo.runtime
```

The script sets `chmod 600` and never echoes secret values.

## 1Password Role

Store:

- DigitalOcean recovery/access notes;
- Doppler service token record;
- Clerk application ids/rotation notes;
- emergency owner credentials.

Do not use 1Password exports as committed repo files.
