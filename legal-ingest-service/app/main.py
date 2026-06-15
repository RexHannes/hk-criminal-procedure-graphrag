"""Optional FastAPI entrypoint for legal source ingestion.

The existing product API remains in api/search-evidence.js. This sidecar
accepts uploads/status requests in production deployments, but Phase 1 keeps the
implementation dependency-light and public-safe.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SERVICE_ROOT = Path(__file__).resolve().parents[1]
REGISTRY_PATH = SERVICE_ROOT / "storage" / "source_registry.local.json"
VAULT_DIR = SERVICE_ROOT / "private_vault"


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def source_record_for_upload(
    *,
    filename: str,
    data: bytes,
    source_type: str,
    title: str,
    jurisdiction: str = "Hong Kong",
    license_status: str = "unknown",
) -> dict[str, Any]:
    checksum = sha256_bytes(data)
    source_id = f"{source_type}:{checksum[:16]}"
    storage_policy = "private_vault_only" if source_type in {"firm_precedent", "licensed_book"} else "public_metadata_private_raw"
    return {
        "source_id": source_id,
        "source_type": source_type,
        "title": title or filename,
        "jurisdiction": jurisdiction,
        "raw_file_uri": f"private://legal-ingest/{source_id}/{filename}",
        "license_status": license_status,
        "storage_policy": storage_policy,
        "checksum": checksum,
        "ingest_status": "uploaded",
        "review_status": "unreviewed",
        "visibility": "firm_private" if storage_policy == "private_vault_only" else "public_metadata",
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }


def append_local_registry(record: dict[str, Any]) -> None:
    REGISTRY_PATH.parent.mkdir(parents=True, exist_ok=True)
    if REGISTRY_PATH.exists():
        payload = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    else:
        payload = {"sources": []}
    payload.setdefault("sources", []).append(record)
    REGISTRY_PATH.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


try:
    from fastapi import FastAPI, File, Form, UploadFile
except Exception:  # pragma: no cover - dependency is optional in Phase 1.
    FastAPI = None  # type: ignore


if FastAPI is not None:
    app = FastAPI(title="HK Legal Ingest Service", version="0.1.0")

    @app.post("/sources/upload")
    async def upload_source(
        file: UploadFile = File(...),
        source_type: str = Form(...),
        title: str = Form(""),
        jurisdiction: str = Form("Hong Kong"),
        license_status: str = Form("unknown"),
    ) -> dict[str, Any]:
        data = await file.read()
        record = source_record_for_upload(
            filename=file.filename or "upload.bin",
            data=data,
            source_type=source_type,
            title=title or file.filename or "Untitled source",
            jurisdiction=jurisdiction,
            license_status=license_status,
        )
        safe_dir = VAULT_DIR / record["source_id"].replace(":", "_")
        safe_dir.mkdir(parents=True, exist_ok=True)
        (safe_dir / (file.filename or "upload.bin")).write_bytes(data)
        append_local_registry(record)
        return {
            "source_id": record["source_id"],
            "checksum": record["checksum"],
            "ingest_status": record["ingest_status"],
            "storage_policy": record["storage_policy"],
            "next_event": "legal/source.uploaded",
        }

    @app.get("/sources/{source_id}/status")
    async def source_status(source_id: str) -> dict[str, Any]:
        if not REGISTRY_PATH.exists():
            return {"source_id": source_id, "status": "not_found"}
        payload = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
        for record in payload.get("sources", []):
            if record.get("source_id") == source_id:
                return record
        return {"source_id": source_id, "status": "not_found"}
else:
    app = None

