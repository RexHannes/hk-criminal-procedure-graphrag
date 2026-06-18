"""Health and readiness routes."""

from __future__ import annotations

from fastapi import APIRouter

from .qdrant_client import qdrant_ready
from .settings import get_settings


router = APIRouter()


@router.get("/health")
def health() -> dict[str, object]:
    settings = get_settings()
    return {
        "status": "ok",
        "app_env": settings.app_env,
        "public_demo_mode": settings.public_demo_mode,
        "private_source_ingestion_enabled": settings.private_source_ingestion_enabled,
    }


@router.get("/ready")
def ready() -> dict[str, object]:
    try:
        qdrant = qdrant_ready()
        return {"status": "ready", "qdrant": qdrant.get("status", "ok")}
    except Exception as exc:  # pragma: no cover - deployment smoke path
        return {"status": "not_ready", "error": str(exc)}
