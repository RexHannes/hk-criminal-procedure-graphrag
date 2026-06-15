"""Book parser v1: registration/chapter metadata only unless licensed private."""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any


def register_book_metadata(path: Path, *, title: str, source_id: str, license_status: str) -> dict[str, Any]:
    data = path.read_bytes()
    storage_policy = "private_vault_only" if license_status in {"licensed_private", "firm_private"} else "metadata_only_no_raw"
    return {
        "source_id": source_id,
        "source_type": "licensed_book",
        "title": title,
        "jurisdiction": "Hong Kong",
        "license_status": license_status,
        "storage_policy": storage_policy,
        "checksum": hashlib.sha256(data).hexdigest(),
        "ingest_status": "registered",
        "review_status": "lawyer_review_required",
        "visibility": "licensed_private" if storage_policy == "private_vault_only" else "public_metadata",
        "public_output": {
            "metadata_only": True,
            "raw_text_emitted": False,
            "answer_layer_status": "research_only",
        },
    }

