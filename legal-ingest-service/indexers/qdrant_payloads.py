"""Qdrant payload builders with legal metadata filters."""

from __future__ import annotations

from typing import Any


REQUIRED_PAYLOAD_FIELDS = [
    "source_id",
    "source_type",
    "jurisdiction",
    "practice_area",
    "issue_tags",
    "authority_role",
    "review_status",
    "answer_layer_status",
    "visibility",
    "source_visibility",
    "tenant_id",
]


def proposition_payload(card: dict[str, Any], *, source_type: str, practice_area: str, visibility: str) -> dict[str, Any]:
    payload = {
        "source_id": card["source_id"],
        "source_type": source_type,
        "jurisdiction": card.get("jurisdiction", "Hong Kong"),
        "practice_area": practice_area,
        "issue_tags": card.get("issue_tags", []),
        "court_level": card.get("court", ""),
        "authority_role": card.get("authority_role", ""),
        "review_status": card.get("review_status", "unreviewed"),
        "answer_layer_status": card.get("answer_layer_status", "research_only"),
        "visibility": visibility,
        "source_visibility": card.get("source_visibility", "public_demo" if visibility in {"public_source", "public_metadata"} else "private_tenant"),
        "tenant_id": card.get("tenant_id", "public" if visibility in {"public_source", "public_metadata"} else card.get("firm_id", "private_unassigned")),
        "firm_id": card.get("firm_id"),
        "proposition_id": card.get("proposition_id"),
        "paragraph_id": card.get("paragraph_id"),
    }
    missing = [field for field in REQUIRED_PAYLOAD_FIELDS if field not in payload or payload[field] in (None, "")]
    if missing:
        raise ValueError(f"Qdrant payload missing metadata filters: {', '.join(missing)}")
    return payload
