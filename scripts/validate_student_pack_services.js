#!/usr/bin/env node
/* Validate GitHub Student Developer Pack service mapping for the Legal RAG MVP. */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const MAP_PATH = path.join(ROOT, "data", "legal_ingest", "mvp", "github_student_pack_services.json");
const DOC_PATH = path.join(ROOT, "docs", "github-student-pack-legal-rag.md");
const ENV_EXAMPLE = path.join(ROOT, ".env.example");

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

function includes(filePath, token, errors) {
  const text = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  assert(text.includes(token), `${path.relative(ROOT, filePath)} missing ${token}`, errors);
}

const errors = [];
assert(fs.existsSync(MAP_PATH), "missing student pack service map", errors);
assert(fs.existsSync(DOC_PATH), "missing student pack runbook", errors);

if (fs.existsSync(MAP_PATH)) {
  const payload = JSON.parse(fs.readFileSync(MAP_PATH, "utf8"));
  assert(payload.pack_id === "github_student_developer_pack_legal_rag_mvp", "unexpected pack_id", errors);
  assert(payload.privacy_rule && payload.privacy_rule.includes("confidential client material"), "privacy rule missing confidential-material warning", errors);
  const services = payload.recommended_stack || [];
  const names = services.map(item => item.service);
  [
    "DigitalOcean",
    "GitHub Pro / Codespaces",
    "Clerk",
    "Appwrite",
    "Doppler / 1Password",
    "Sentry / New Relic / Datadog",
    "Azure",
  ].forEach(name => assert(names.includes(name), `service missing: ${name}`, errors));
  const digitalOcean = services.find(item => item.service === "DigitalOcean") || {};
  assert((digitalOcean.rag_blockers_helped || []).includes("production_qdrant_host"), "DigitalOcean should map to production_qdrant_host", errors);
  const clerk = services.find(item => item.service === "Clerk") || {};
  assert((clerk.rag_blockers_helped || []).includes("tenant_access_controls"), "Clerk should map to tenant access controls", errors);
}

[
  "DigitalOcean",
  "Clerk",
  "Doppler",
  "confidential legal/client materials",
].forEach(token => includes(DOC_PATH, token, errors));

[
  "DIGITALOCEAN_ACCESS_TOKEN=",
  "CLERK_SECRET_KEY=",
  "APPWRITE_ENDPOINT=",
  "DOPPLER_PROJECT=",
  "SENTRY_DSN=",
  "AZURE_OPENAI_ENDPOINT=",
].forEach(token => includes(ENV_EXAMPLE, token, errors));

if (errors.length) {
  console.error("Student Pack services validation failed:");
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log("Student Pack services validation passed.");
