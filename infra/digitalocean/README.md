# DigitalOcean Safe Demo Scaffold

This folder contains a manual deployment scaffold for a public-source HK LegalTech RAG demo.

The intended deployment target is a DigitalOcean Droplet with Docker Compose, not App Platform. Qdrant requires persistent storage and must not be exposed to the public internet.

## Services

- `qdrant`: internal vector store on Docker network only.
- `api`: FastAPI demo surface.
- `caddy`: public reverse proxy exposing only FastAPI on ports 80/443.

## Deployment Rules

- Public/demo corpus only.
- `PRIVATE_SOURCE_INGESTION_ENABLED=false` by default.
- No client documents.
- No licensed textbooks/forms/precedents.
- No real secrets committed.
- Qdrant port `6333` is internal-only.

## Manual Steps

1. Create an Ubuntu LTS Droplet.
2. Run `sudo ./bootstrap_ubuntu_droplet.sh`.
3. Clone the repo.
4. Configure Doppler service token on the server.
5. Run `./render_env_from_doppler.sh`.
6. Copy `Caddyfile.example` to `Caddyfile`.
7. Set `DEMO_DOMAIN` in Doppler.
8. Run `./deploy_demo.sh`.
9. Check `/health`, `/ready`, and `POST /api/legal-query`.
10. Confirm `/api/private/ingest` returns 403 while private ingestion is disabled.
