"""Optional FastAPI entrypoint for legal source ingestion.

The existing product API remains in api/search-evidence.js. This sidecar
accepts uploads/status requests in production deployments, but Phase 1 keeps the
implementation dependency-light and public-safe.
"""

from __future__ import annotations

import hashlib
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from storage_adapters.legal_storage import (  # noqa: E402
    configured_backends,
    safe_object_path,
    storage_bucket_for_source,
    storage_prefix_for_source,
)
from validators.source_policy import apply_policy_to_source  # noqa: E402


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
    raw_file_uri: str | None = None,
) -> dict[str, Any]:
    checksum = sha256_bytes(data)
    source_id = f"{source_type}:{checksum[:16]}"
    record = {
        "source_id": source_id,
        "source_type": source_type,
        "title": title or filename,
        "jurisdiction": jurisdiction,
        "raw_file_uri": raw_file_uri or f"private://legal-ingest/{source_id}/{filename}",
        "license_status": license_status,
        "checksum": checksum,
        "ingest_status": "uploaded",
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    return apply_policy_to_source(record)


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
        storage, registry, backend_name = configured_backends()
        filename = file.filename or "upload.bin"
        checksum = sha256_bytes(data)
        source_id = f"{source_type}:{checksum[:16]}"
        bucket = storage_bucket_for_source(source_type, license_status)
        object_path = safe_object_path(storage_prefix_for_source(source_type), source_id, filename)
        record = source_record_for_upload(
            filename=filename,
            data=data,
            source_type=source_type,
            title=title or filename or "Untitled source",
            jurisdiction=jurisdiction,
            license_status=license_status,
        )
        raw_file_uri = record["raw_file_uri"]
        if record.get("rag_policy", {}).get("may_store_raw"):
            raw_file_uri = storage.put_object(
                bucket=bucket,
                object_path=object_path,
                data=data,
                content_type=file.content_type or "application/octet-stream",
            )
            record["raw_file_uri"] = raw_file_uri
        else:
            record["ingest_status"] = "blocked"
            record["raw_file_uri"] = ""
            raw_file_uri = ""
        registry.insert_source(record)
        return {
            "source_id": record["source_id"],
            "checksum": record["checksum"],
            "ingest_status": record["ingest_status"],
            "storage_policy": record["storage_policy"],
            "visibility": record["visibility"],
            "rag_policy": record["rag_policy"],
            "storage_backend": backend_name,
            "bucket": bucket,
            "raw_file_uri": raw_file_uri,
            "next_event": "legal/source.uploaded",
        }

    @app.get("/sources/{source_id}/status")
    async def source_status(source_id: str) -> dict[str, Any]:
        _, registry, backend_name = configured_backends()
        record = registry.get_source(source_id)
        return record or {"source_id": source_id, "status": "not_found", "storage_backend": backend_name}
else:
    app = None
