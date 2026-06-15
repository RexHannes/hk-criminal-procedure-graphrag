"""Book parser v1: registration/chapter metadata only unless licensed private."""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any

try:
    from validators.source_policy import apply_policy_to_source
except ModuleNotFoundError:  # pragma: no cover - supports direct file imports in validators.
    import importlib.util

    _policy_path = Path(__file__).resolve().parents[1] / "validators" / "source_policy.py"
    _spec = importlib.util.spec_from_file_location("source_policy", _policy_path)
    if _spec is None or _spec.loader is None:
        raise
    _module = importlib.util.module_from_spec(_spec)
    _spec.loader.exec_module(_module)
    apply_policy_to_source = _module.apply_policy_to_source


def register_book_metadata(
    path: Path,
    *,
    title: str,
    source_id: str,
    license_status: str,
    firm_id: str | None = None,
) -> dict[str, Any]:
    data = path.read_bytes()
    record = {
        "source_id": source_id,
        "source_type": "licensed_book",
        "title": title,
        "jurisdiction": "Hong Kong",
        "license_status": license_status,
        "checksum": hashlib.sha256(data).hexdigest(),
        "ingest_status": "registered",
        "public_output": {
            "metadata_only": True,
            "raw_text_emitted": False,
            "answer_layer_status": "research_only",
        },
    }
    if firm_id:
        record["firm_id"] = firm_id
    return apply_policy_to_source(record, firm_id=firm_id)

