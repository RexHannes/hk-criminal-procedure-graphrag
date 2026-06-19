#!/usr/bin/env node
/* eslint-disable no-console */

const { assertPrivateIngestionMayRun, canRetrieveSource } = require("../src/legal_answer/access/private_source_policy");

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

const errors = [];
const offEnv = { PRIVATE_SOURCE_INGESTION_ENABLED: "false", CLERK_ENABLED: "false" };
const onEnv = { PRIVATE_SOURCE_INGESTION_ENABLED: "true", CLERK_ENABLED: "true" };

assert(canRetrieveSource({ source: { source_visibility: "public_demo", tenant_id: "public" }, env: offEnv }).allowed, "public source should be retrievable", errors);
assert(!canRetrieveSource({ source: { source_visibility: "private_tenant", tenant_id: "org_a" }, auth: { org_id: "org_a" }, env: offEnv }).allowed, "private source must be blocked when ingestion disabled", errors);
assert(canRetrieveSource({ source: { source_visibility: "private_tenant", tenant_id: "org_a" }, auth: { org_id: "org_a" }, env: onEnv }).allowed, "tenant should retrieve own private source when enabled", errors);
assert(!canRetrieveSource({ source: { source_visibility: "private_tenant", tenant_id: "org_b" }, auth: { org_id: "org_a" }, env: onEnv }).allowed, "tenant A must not retrieve tenant B", errors);
assert(!canRetrieveSource({ source: { source_visibility: "licensed_private", tenant_id: "org_a" }, auth: { org_id: "org_a" }, env: onEnv }).allowed, "licensed_private needs explicit policy", errors);
assert(assertPrivateIngestionMayRun({ auth: { org_id: "org_a" }, env: offEnv }).reason === "private_source_ingestion_disabled", "ingestion disabled gate missing", errors);
assert(assertPrivateIngestionMayRun({ auth: {}, env: onEnv }).reason === "tenant_auth_required", "private ingestion must require tenant auth", errors);
assert(assertPrivateIngestionMayRun({ auth: { user_id: "user_a" }, env: onEnv }).allowed, "authenticated user tenant should pass policy when enabled", errors);

if (errors.length) {
  console.error("Private source access validation failed:");
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log("Private source access validation passed.");
