"""Clerk tenant-auth scaffold.

This module intentionally fails closed for private endpoints unless Clerk is
enabled and a Bearer token is presented. Full Clerk JWT verification should be
added before private-source ingestion is enabled.
"""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import Header, HTTPException, status

from .settings import Settings, get_settings


@dataclass(frozen=True)
class AuthContext:
    user_id: str = ""
    org_id: str = ""
    tenant_id: str = "public"
    session_id: str = ""
    is_authenticated: bool = False
    source_mode: str = "public_demo"


def public_auth_context() -> AuthContext:
    return AuthContext()


def _parse_demo_token(token: str) -> AuthContext:
    """Parse a local-only demo token.

    Format: demo:user_id[:org_id[:session_id]]
    This is not production verification; it exists so deployment smoke tests can
    exercise tenant plumbing without trusting tenant_id from request bodies.
    """

    if not token.startswith("demo:"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_auth_token")
    _, user_id, *rest = token.split(":")
    org_id = rest[0] if len(rest) > 0 else ""
    session_id = rest[1] if len(rest) > 1 else ""
    tenant_id = org_id or user_id
    if not tenant_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing_tenant")
    return AuthContext(
        user_id=user_id,
        org_id=org_id,
        tenant_id=tenant_id,
        session_id=session_id,
        is_authenticated=True,
        source_mode="private_tenant",
    )


def require_private_auth(authorization: str | None = Header(default=None)) -> AuthContext:
    settings: Settings = get_settings()
    if not settings.clerk_enabled:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="clerk_disabled")
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing_bearer_token")
    token = authorization.split(" ", 1)[1].strip()
    return _parse_demo_token(token)
