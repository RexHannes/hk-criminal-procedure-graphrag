# Clerk Tenant Auth Scaffold

Private-source retrieval and ingestion require tenant identity before they can be enabled.

## Tenant Rule

The API must never trust `tenant_id` supplied in a request body.

Tenant ID is derived from authenticated Clerk context:

```text
tenant_id = Clerk org_id if present
tenant_id = Clerk user_id otherwise
```

## Current Demo Scaffold

`src/api/auth.py` provides an interface and a disabled-by-default auth dependency.

Rules:

- `CLERK_ENABLED=false`: only public demo endpoints should work.
- `CLERK_ENABLED=true`: private endpoints require a Bearer token.
- Missing or invalid auth returns `401`.
- Private ingestion also requires `PRIVATE_SOURCE_INGESTION_ENABLED=true`; default is `false`.

For local deployment smoke tests only, the scaffold accepts a demo token format:

```text
Authorization: Bearer demo:user_id:org_id:session_id
```

This is not production JWT verification. Replace it with Clerk backend token verification before private-source ingestion is enabled.

## Required Env Placeholders

```text
CLERK_ENABLED=false
CLERK_SECRET_KEY=
CLERK_JWT_KEY=
CLERK_AUTHORIZED_PARTIES=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
PRIVATE_SOURCE_INGESTION_ENABLED=false
```

## Retrieval Boundary

Public demo retrieval:

```json
{
  "source_visibility": "public_demo",
  "tenant_id": "public"
}
```

Authenticated tenant retrieval may include public demo sources plus:

```json
{
  "source_visibility": "private_tenant",
  "tenant_id": "org_or_user_from_clerk"
}
```

Private retrieval must remain unavailable while `PRIVATE_SOURCE_INGESTION_ENABLED=false`.
