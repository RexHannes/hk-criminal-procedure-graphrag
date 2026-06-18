#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

const errors = [];
const compose = read("infra/digitalocean/docker-compose.demo.yml");
const dockerfile = read("Dockerfile.fastapi");
const caddy = read("infra/digitalocean/Caddyfile.example");
const docs = read("docs/digitalocean-qdrant-fastapi-demo.md");
const health = read("src/api/routes_health.py");
const routes = read("src/api/routes_legal_query.py");

assert(compose.includes("qdrant/qdrant:latest"), "compose must use official qdrant image", errors);
assert(compose.includes('expose:\n      - "6333"'), "qdrant must be exposed only internally", errors);
assert(!compose.includes('"6333:6333"') && !compose.includes("- 6333:6333"), "qdrant must not publish 6333", errors);
assert(compose.includes("QDRANT__SERVICE__API_KEY"), "qdrant API key env missing", errors);
assert(compose.includes("qdrant_storage:/qdrant/storage"), "qdrant persistent storage missing", errors);
assert(compose.includes("QDRANT_URL: http://qdrant:6333"), "api must point to internal qdrant", errors);
assert(compose.includes('PRIVATE_SOURCE_INGESTION_ENABLED: "false"'), "private ingestion must be false in compose", errors);
assert(compose.includes('"80:80"') && compose.includes('"443:443"'), "caddy must expose 80/443", errors);
assert(caddy.includes("reverse_proxy api:8000"), "Caddyfile must proxy FastAPI only", errors);

for (const token of ["fastapi", "uvicorn", "EXPOSE 8000", "src.api.main:app"]) {
  assert(dockerfile.includes(token), `Dockerfile.fastapi missing ${token}`, errors);
}

for (const token of ['@router.get("/health")', '@router.get("/ready")']) {
  assert(health.includes(token), `health routes missing ${token}`, errors);
}

for (const token of ['@router.post("/api/legal-query")', '@router.post("/api/private/legal-query")', '@router.post("/api/private/ingest")']) {
  assert(routes.includes(token), `legal query routes missing ${token}`, errors);
}

for (const token of ["do not expose 6333 publicly", "Confirm private ingestion is blocked", "Public/demo corpus only"]) {
  assert(docs.includes(token), `DigitalOcean docs missing ${token}`, errors);
}

if (errors.length) {
  console.error("DigitalOcean deployment config validation failed:");
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log("DigitalOcean deployment config validation passed.");
