#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -f .env.demo.runtime ]; then
  echo "Missing infra/digitalocean/.env.demo.runtime. Generate it with render_env_from_doppler.sh or copy .env.demo.example for local smoke only." >&2
  exit 1
fi

if [ ! -f Caddyfile ]; then
  echo "Missing Caddyfile. Copy Caddyfile.example to Caddyfile and set DEMO_DOMAIN first." >&2
  exit 1
fi

docker compose --env-file .env.demo.runtime -f docker-compose.demo.yml pull qdrant caddy
docker compose --env-file .env.demo.runtime -f docker-compose.demo.yml up -d --build
docker compose --env-file .env.demo.runtime -f docker-compose.demo.yml ps
