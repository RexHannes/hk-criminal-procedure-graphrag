function privateIngestionEnabled(env = process.env) {
  return String(env.PRIVATE_SOURCE_INGESTION_ENABLED || "false").toLowerCase() === "true";
}

function clerkEnabled(env = process.env) {
  return String(env.CLERK_ENABLED || "false").toLowerCase() === "true";
}

function tenantIdFromAuth(auth = {}) {
  return auth.org_id || auth.user_id || "";
}

function canRetrieveSource({ source = {}, auth = {}, env = process.env } = {}) {
  const visibility = source.source_visibility || "public_demo";
  const tenantId = source.tenant_id || "public";
  if (visibility === "public_demo") return { allowed: tenantId === "public", reason: tenantId === "public" ? "public_demo" : "invalid_public_tenant" };
  if (visibility === "private_tenant") {
    if (!privateIngestionEnabled(env)) return { allowed: false, reason: "private_ingestion_disabled" };
    if (!clerkEnabled(env)) return { allowed: false, reason: "clerk_required" };
    const authTenant = tenantIdFromAuth(auth);
    return {
      allowed: Boolean(authTenant && authTenant === tenantId),
      reason: authTenant === tenantId ? "tenant_match" : "tenant_mismatch",
    };
  }
  if (visibility === "licensed_private") {
    return { allowed: false, reason: "licensed_private_requires_explicit_policy" };
  }
  return { allowed: false, reason: "unknown_source_visibility" };
}

function assertPrivateIngestionMayRun({ auth = {}, env = process.env } = {}) {
  if (!privateIngestionEnabled(env)) return { allowed: false, status: 403, reason: "private_source_ingestion_disabled" };
  if (!clerkEnabled(env)) return { allowed: false, status: 401, reason: "clerk_required" };
  if (!tenantIdFromAuth(auth)) return { allowed: false, status: 401, reason: "tenant_auth_required" };
  return { allowed: true, status: 200, reason: "tenant_private_ingestion_allowed" };
}

module.exports = {
  assertPrivateIngestionMayRun,
  canRetrieveSource,
  clerkEnabled,
  privateIngestionEnabled,
  tenantIdFromAuth,
};
