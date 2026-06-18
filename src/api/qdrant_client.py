"""Tiny Qdrant REST client for the FastAPI demo surface."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any

from .settings import Settings, get_settings


def _headers(settings: Settings) -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if settings.qdrant_api_key:
        headers["api-key"] = settings.qdrant_api_key
    return headers


def qdrant_request(path: str, *, method: str = "GET", payload: dict[str, Any] | None = None) -> dict[str, Any]:
    settings = get_settings()
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(
        f"{settings.qdrant_url.rstrip('/')}{path}",
        data=data,
        method=method,
        headers=_headers(settings),
    )
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            text = response.read().decode("utf-8")
            return json.loads(text) if text else {}
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Qdrant HTTP {exc.code}: {body}") from exc


def qdrant_ready() -> dict[str, Any]:
    settings = get_settings()
    return qdrant_request(f"/collections/{settings.qdrant_collection_propositions}")
