#!/usr/bin/env python3
"""Validate production storage/review wiring without requiring credentials."""

from __future__ import annotations

import ast
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ENV_EXAMPLE = ROOT / ".env.example"
STORAGE_ADAPTER = ROOT / "legal-ingest-service" / "storage_adapters" / "legal_storage.py"
APP_MAIN = ROOT / "legal-ingest-service" / "app" / "main.py"
REVIEW_QUEUE = ROOT / "api" / "legal-ingest" / "review-queue.js"
APPROVE_ENDPOINT = ROOT / "api" / "legal-ingest" / "review" / "[card_id]" / "approve.js"
BUCKET_MIGRATION = ROOT / "supabase" / "migrations" / "20260611001000_create_legal_storage_buckets.sql"


def main() -> int:
    errors: list[str] = []

    for path in [STORAGE_ADAPTER, APP_MAIN]:
        try:
            ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        except SyntaxError as exc:
            errors.append(f"{path}: syntax error {exc}")

    env = ENV_EXAMPLE.read_text(encoding="utf-8")
    for key in [
        "LEGAL_STORAGE_BACKEND",
        "LEGAL_PRIVATE_BUCKET",
        "LEGAL_PUBLIC_BUCKET",
        "LEGAL_PARSED_BUCKET",
        "LEGAL_REVIEW_ADMIN_TOKEN",
        "QDRANT_URL",
        "QDRANT_COLLECTION_PROPOSITIONS",
    ]:
        if f"{key}=" not in env:
            errors.append(f".env.example missing {key}")

    adapter = STORAGE_ADAPTER.read_text(encoding="utf-8")
    if "LEGAL_STORAGE_BACKEND" not in adapter or "SupabaseStorageBackend" not in adapter:
        errors.append("storage adapter missing Supabase backend selection")
    if "/storage/v1/object/" not in adapter:
        errors.append("storage adapter does not target Supabase Storage object API")
    if "/rest/v1/" not in adapter:
        errors.append("registry adapter does not target Supabase REST API")

    app = APP_MAIN.read_text(encoding="utf-8")
    if "configured_backends()" not in app:
        errors.append("FastAPI app is not using configured storage/registry backends")
    if "may_store_raw" not in app:
        errors.append("FastAPI app must consult source policy before storing raw bytes")

    for endpoint in [REVIEW_QUEUE, APPROVE_ENDPOINT]:
        if not endpoint.exists():
            errors.append(f"missing endpoint {endpoint}")
    review_queue = REVIEW_QUEUE.read_text(encoding="utf-8")
    if "supabase_query_failed_fallback_local" not in review_queue:
        errors.append("review queue should fallback to local JSON when Supabase tables are not deployed")
    approve = APPROVE_ENDPOINT.read_text(encoding="utf-8")
    if "LEGAL_REVIEW_ADMIN_TOKEN" not in (ROOT / "api" / "legal-ingest" / "_utils.js").read_text(encoding="utf-8"):
        errors.append("review admin token guard missing")
    if "promote_answer_safe" not in approve:
        errors.append("approval endpoint must make answer_safe promotion explicit")
    if "supabase_not_configured" not in approve:
        errors.append("approval endpoint should fail closed unless Supabase is configured")

    migration = BUCKET_MIGRATION.read_text(encoding="utf-8")
    for bucket in ["legal-private-vault", "legal-public-sources", "legal-parsed-artifacts"]:
        if bucket not in migration:
            errors.append(f"bucket migration missing {bucket}")
    if "public, file_size_limit" not in migration or "false" not in migration:
        errors.append("bucket migration should create private buckets")

    if errors:
        print("Legal ingest storage validation failed:")
        for error in errors:
            print(f"- {error}")
        return 1
    print("Legal ingest storage validation passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
