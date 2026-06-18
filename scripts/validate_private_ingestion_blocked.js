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
const env = read(".env.example");
const compose = read("infra/digitalocean/docker-compose.demo.yml");
const demoEnv = read("infra/digitalocean/.env.demo.example");
const routes = read("src/api/routes_legal_query.py");
const settings = read("src/api/settings.py");

for (const text of [env, compose, demoEnv]) {
  assert(text.includes("PRIVATE_SOURCE_INGESTION_ENABLED=false") || text.includes('PRIVATE_SOURCE_INGESTION_ENABLED: "false"'), "private ingestion must default false", errors);
}

assert(settings.includes('env_bool("PRIVATE_SOURCE_INGESTION_ENABLED", False)'), "settings must default private ingestion false", errors);
assert(routes.includes("private_source_ingestion_disabled"), "private ingest route must explicitly block disabled ingestion", errors);
assert(routes.includes("tenant_auth_required"), "private ingest route must require tenant auth", errors);
assert(routes.includes("lawyer review"), "private ingest route should preserve review warning", errors);

if (errors.length) {
  console.error("Private-ingestion blocked validation failed:");
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log("Private ingestion blocked by default.");
