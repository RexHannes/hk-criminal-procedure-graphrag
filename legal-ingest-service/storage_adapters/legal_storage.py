"""Storage and registry adapters for legal ingestion.

Local storage is the default for development. Supabase Storage/REST is selected
only when LEGAL_STORAGE_BACKEND=supabase and server-side credentials are set.
No service-role key should ever be exposed to browser code.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol


SERVICE_ROOT = Path(__file__).resolve().parents[1]
LOCAL_STORAGE_ROOT = SERVICE_ROOT / "storage"
LOCAL_VAULT_ROOT = SERVICE_ROOT / "private_vault"
LOCAL_REGISTRY_PATH = LOCAL_STORAGE_ROOT / "source_registry.local.json"

PRIVATE_SOURCE_TYPES = {"firm_precedent", "licensed_book", "private_doctrine_note"}


class StorageBackend(Protocol):
    def put_object(self, *, bucket: str, object_path: str, data: bytes, content_type: str) -> str:
        ...


class RegistryBackend(Protocol):
    def insert_source(self, record: dict[str, Any]) -> None:
        ...

    def get_source(self, source_id: str) -> dict[str, Any] | None:
        ...


def safe_object_path(*parts: str) -> str:
    cleaned = []
    for part in parts:
        token = str(part or "").replace("\\", "/").strip("/")
        token = token.replace("..", "_")
        cleaned.extend(p for p in token.split("/") if p and p != ".")
    return "/".join(cleaned)


@dataclass
class LocalStorageBackend:
    root: Path = LOCAL_VAULT_ROOT

    def put_object(self, *, bucket: str, object_path: str, data: bytes, content_type: str) -> str:
        target = self.root / bucket / safe_object_path(object_path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        return f"private://local/{bucket}/{safe_object_path(object_path)}"


@dataclass
class LocalRegistryBackend:
    path: Path = LOCAL_REGISTRY_PATH

    def _read(self) -> dict[str, Any]:
        if not self.path.exists():
            return {"sources": []}
        return json.loads(self.path.read_text(encoding="utf-8"))

    def _write(self, payload: dict[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

    def insert_source(self, record: dict[str, Any]) -> None:
        payload = self._read()
        sources = payload.setdefault("sources", [])
        sources[:] = [item for item in sources if item.get("source_id") != record.get("source_id")]
        sources.append(record)
        self._write(payload)

    def get_source(self, source_id: str) -> dict[str, Any] | None:
        for record in self._read().get("sources", []):
            if record.get("source_id") == source_id:
                return record
        return None


@dataclass
class SupabaseStorageBackend:
    supabase_url: str
    service_role_key: str

    def put_object(self, *, bucket: str, object_path: str, data: bytes, content_type: str) -> str:
        clean_path = safe_object_path(object_path)
        encoded_path = urllib.parse.quote(clean_path, safe="/")
        url = f"{self.supabase_url.rstrip('/')}/storage/v1/object/{bucket}/{encoded_path}"
        req = urllib.request.Request(
            url,
            data=data,
            method="POST",
            headers={
                "Authorization": f"Bearer {self.service_role_key}",
                "apikey": self.service_role_key,
                "Content-Type": content_type or "application/octet-stream",
                "x-upsert": "false",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                if resp.status >= 400:
                    raise RuntimeError(f"Supabase Storage upload failed: HTTP {resp.status}")
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Supabase Storage upload failed: HTTP {exc.code} {body}") from exc
        return f"supabase://{bucket}/{clean_path}"


@dataclass
class SupabaseRegistryBackend:
    supabase_url: str
    service_role_key: str

    def _request(self, path: str, *, method: str = "GET", payload: dict[str, Any] | None = None) -> Any:
        data = json.dumps(payload).encode("utf-8") if payload is not None else None
        req = urllib.request.Request(
            f"{self.supabase_url.rstrip('/')}/rest/v1/{path}",
            data=data,
            method=method,
            headers={
                "Authorization": f"Bearer {self.service_role_key}",
                "apikey": self.service_role_key,
                "Content-Type": "application/json",
                "Prefer": "return=representation,resolution=merge-duplicates",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                text = resp.read().decode("utf-8")
                return json.loads(text) if text else None
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Supabase REST request failed: HTTP {exc.code} {body}") from exc

    def insert_source(self, record: dict[str, Any]) -> None:
        self._request("source_registry?on_conflict=source_id", method="POST", payload=record)

    def get_source(self, source_id: str) -> dict[str, Any] | None:
        query = urllib.parse.urlencode({"source_id": f"eq.{source_id}", "select": "*"})
        rows = self._request(f"source_registry?{query}")
        return rows[0] if rows else None


def storage_bucket_for_source(source_type: str, license_status: str) -> str:
    if source_type in PRIVATE_SOURCE_TYPES or license_status in {"firm_private", "licensed_private"}:
        return os.getenv("LEGAL_PRIVATE_BUCKET", "legal-private-vault")
    if source_type in {"case", "legislation", "practice_direction"}:
        return os.getenv("LEGAL_PUBLIC_BUCKET", "legal-public-sources")
    return os.getenv("LEGAL_PRIVATE_BUCKET", "legal-private-vault")


def storage_prefix_for_source(source_type: str) -> str:
    return {
        "case": "cases",
        "legislation": "legislation",
        "practice_direction": "practice_directions",
        "court_form": "forms/official",
        "firm_precedent": "forms/firm",
        "licensed_book": "books",
        "private_doctrine_note": "doctrine_notes",
    }.get(source_type, "misc")


def configured_backends() -> tuple[StorageBackend, RegistryBackend, str]:
    backend = os.getenv("LEGAL_STORAGE_BACKEND", "local").strip().lower()
    supabase_url = os.getenv("SUPABASE_URL", "").strip()
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if backend == "supabase" and supabase_url and service_key:
        return (
            SupabaseStorageBackend(supabase_url=supabase_url, service_role_key=service_key),
            SupabaseRegistryBackend(supabase_url=supabase_url, service_role_key=service_key),
            "supabase",
        )
    return LocalStorageBackend(), LocalRegistryBackend(), "local"
