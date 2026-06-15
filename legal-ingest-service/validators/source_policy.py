"""Source intake policy for marketable but fail-closed legal RAG.

The policy is intentionally conservative. It decides what may be stored, parsed,
embedded, surfaced in public metadata, and promoted into answer text.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


PUBLIC_LICENSES = {"public_judgment", "public_legislation", "official_reference"}
PRIVATE_LICENSES = {"firm_private", "licensed_private"}
PRIVATE_SOURCE_TYPES = {"firm_precedent", "licensed_book", "private_doctrine_note"}
PROHIBITED_LICENSES = {"prohibited"}


@dataclass(frozen=True)
class SourcePolicy:
    storage_policy: str
    visibility: str
    may_store_raw: bool
    may_parse_text: bool
    may_emit_public_text: bool
    may_embed: bool
    vector_namespace: str
    default_answer_layer_status: str
    review_status: str
    reason: str


def policy_for_source(source_type: str, license_status: str, *, firm_id: str | None = None) -> SourcePolicy:
    """Return the strictest policy for a source before upload or parsing."""

    if license_status in PROHIBITED_LICENSES:
        return SourcePolicy(
            storage_policy="do_not_index",
            visibility="blocked",
            may_store_raw=False,
            may_parse_text=False,
            may_emit_public_text=False,
            may_embed=False,
            vector_namespace="blocked",
            default_answer_layer_status="not_product_answer_layer",
            review_status="rejected",
            reason="Prohibited source; registration may be kept only as an audit block record.",
        )

    if source_type in PRIVATE_SOURCE_TYPES or license_status in PRIVATE_LICENSES:
        namespace = f"private:{firm_id}" if firm_id else "private:unassigned"
        return SourcePolicy(
            storage_policy="private_vault_only",
            visibility="licensed_private" if license_status == "licensed_private" else "firm_private",
            may_store_raw=True,
            may_parse_text=True,
            may_emit_public_text=False,
            may_embed=True,
            vector_namespace=namespace,
            default_answer_layer_status="research_only",
            review_status="lawyer_review_required",
            reason="Private/licensed source: raw text and embeddings must stay in the private vault namespace.",
        )

    if license_status in PUBLIC_LICENSES:
        return SourcePolicy(
            storage_policy="public_metadata_public_raw",
            visibility="public_source",
            may_store_raw=True,
            may_parse_text=True,
            may_emit_public_text=True,
            may_embed=True,
            vector_namespace="public:hk-law",
            default_answer_layer_status="research_only",
            review_status="lawyer_review_required",
            reason="Public legal source: may be parsed and indexed, but remains research-only until review.",
        )

    return SourcePolicy(
        storage_policy="metadata_only_no_raw",
        visibility="public_metadata",
        may_store_raw=False,
        may_parse_text=False,
        may_emit_public_text=False,
        may_embed=False,
        vector_namespace="metadata-only",
        default_answer_layer_status="not_product_answer_layer",
        review_status="lawyer_review_required",
        reason="Unknown or metadata-only source: block raw-text ingestion until licence is classified.",
    )


def apply_policy_to_source(record: dict[str, Any], *, firm_id: str | None = None) -> dict[str, Any]:
    """Normalize a source registry record with policy-derived safety fields."""

    policy = policy_for_source(
        str(record.get("source_type", "")),
        str(record.get("license_status", "unknown")),
        firm_id=firm_id or record.get("firm_id"),
    )
    normalized = dict(record)
    normalized.update(
        {
            "storage_policy": policy.storage_policy,
            "visibility": policy.visibility,
            "review_status": policy.review_status,
            "ingest_status": "blocked" if policy.storage_policy == "do_not_index" else record.get("ingest_status", "registered"),
            "rag_policy": {
                "may_store_raw": policy.may_store_raw,
                "may_parse_text": policy.may_parse_text,
                "may_emit_public_text": policy.may_emit_public_text,
                "may_embed": policy.may_embed,
                "vector_namespace": policy.vector_namespace,
                "default_answer_layer_status": policy.default_answer_layer_status,
                "reason": policy.reason,
            },
        }
    )
    return normalized
