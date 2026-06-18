"""Runtime settings for the hosted public-demo API."""

from __future__ import annotations

import os
from dataclasses import dataclass


def env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    app_env: str = os.getenv("APP_ENV", "demo")
    public_demo_mode: bool = env_bool("PUBLIC_DEMO_MODE", True)
    private_source_ingestion_enabled: bool = env_bool("PRIVATE_SOURCE_INGESTION_ENABLED", False)
    qdrant_url: str = os.getenv("QDRANT_URL", "http://qdrant:6333")
    qdrant_api_key: str = os.getenv("QDRANT_API_KEY", "")
    qdrant_collection_propositions: str = os.getenv("QDRANT_COLLECTION_PROPOSITIONS", "hk_proposition_cards")
    clerk_enabled: bool = env_bool("CLERK_ENABLED", False)
    clerk_secret_key: str = os.getenv("CLERK_SECRET_KEY", "")
    clerk_jwt_key: str = os.getenv("CLERK_JWT_KEY", "")
    clerk_authorized_parties: str = os.getenv("CLERK_AUTHORIZED_PARTIES", "")


def get_settings() -> Settings:
    return Settings()
