# DigitalOcean Qdrant/FastAPI Demo

This is a public/demo-source deployment plan for the HK LegalTech source-gated RAG assistant.

Use a DigitalOcean Droplet with Docker Compose. Do not use App Platform for Qdrant persistence. Qdrant must stay on the internal Docker network; only the FastAPI reverse proxy should be public.

## Manual Deployment Steps

1. Create an Ubuntu LTS Droplet.
2. Add your SSH key.
3. Configure firewall:
   - allow 22 only from operator IP if possible;
   - allow 80/443 from internet;
   - do not expose 6333 publicly;
   - do not expose 8000 publicly if Caddy is used.
4. Copy or clone the repo.
5. Run:

```bash
cd infra/digitalocean
sudo ./bootstrap_ubuntu_droplet.sh
```

6. Configure a Doppler service token on the server.
7. Render runtime env:

```bash
./render_env_from_doppler.sh
```

8. Copy Caddyfile:

```bash
cp Caddyfile.example Caddyfile
```

9. Deploy:

```bash
./deploy_demo.sh
```

10. Check:

```bash
curl https://$DEMO_DOMAIN/health
curl https://$DEMO_DOMAIN/ready
curl -X POST https://$DEMO_DOMAIN/api/legal-query \
  -H "Content-Type: application/json" \
  -d '{"query":"What is the consequence of inconsistent pleadings?","top_k":5}'
```

11. Confirm private ingestion is blocked:

```bash
curl -i -X POST https://$DEMO_DOMAIN/api/private/ingest
```

Expected result: `401` if Clerk is disabled/missing, or `403 private_source_ingestion_disabled` if authenticated but private ingestion remains disabled.

## Guardrails

- Public/demo corpus only.
- Do not upload client documents.
- Do not upload licensed textbooks/forms/precedents.
- `PRIVATE_SOURCE_INGESTION_ENABLED=false` until Clerk tenant auth, source isolation, audit logs, and retrieval filters are verified.
- Every legal answer must remain source-gated.
- Qdrant must not be publicly exposed.
