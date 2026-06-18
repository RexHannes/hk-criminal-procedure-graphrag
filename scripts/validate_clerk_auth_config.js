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
const auth = read("src/api/auth.py");
const docs = read("docs/clerk-tenant-auth.md");

for (const key of [
  "CLERK_ENABLED=false",
  "CLERK_SECRET_KEY=",
  "CLERK_JWT_KEY=",
  "CLERK_AUTHORIZED_PARTIES=",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=",
  "PRIVATE_SOURCE_INGESTION_ENABLED=false",
]) {
  assert(env.includes(key), `.env.example missing ${key}`, errors);
}

for (const token of ["AuthContext", "require_private_auth", "clerk_disabled", "missing_bearer_token", "tenant_id = org_id or user_id"]) {
  assert(auth.includes(token), `auth.py missing ${token}`, errors);
}

for (const token of ["must never trust `tenant_id`", "CLERK_ENABLED=false", "PRIVATE_SOURCE_INGESTION_ENABLED=false"]) {
  assert(docs.includes(token), `Clerk docs missing ${token}`, errors);
}

if (errors.length) {
  console.error("Clerk auth config validation failed:");
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log("Clerk auth config validation passed.");
