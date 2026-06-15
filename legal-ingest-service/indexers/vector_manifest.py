"""Vector manifest builder for Qdrant/pgvector-style legal retrieval.

The manifest is adapter-neutral: production can use Qdrant, pgvector,
Pinecone, OpenSearch, or another backend. The important part is that every
vector row carries legal filters and source-card review status.
"""

from __future__ import annotations

from typing import Any


REQUIRED_VECTOR_FILTERS = [
    "source_id",
    "source_type",
    "jurisdiction",
    "visibility",
    "vector_namespace",
    "review_status",
    "answer_layer_status",
    "chunk_id",
    "chunk_hash",
]


def vector_point_manifest(
    chunk: dict[str, Any],
    source: dict[str, Any],
    *,
    practice_area: str,
    issue_tags: list[str] | None = None,
    embedding_model: str = "adapter-configured",
) -> dict[str, Any]:
    policy = source.get("rag_policy", {})
    if not policy.get("may_embed", False):
        raise ValueError(f"{source.get('source_id')}: source policy blocks embedding")

    payload = {
        "source_id": source["source_id"],
        "source_type": source["source_type"],
        "jurisdiction": source.get("jurisdiction", "Hong Kong"),
        "citation": source.get("citation") or chunk.get("citation", ""),
        "visibility": source.get("visibility", "public_metadata"),
        "vector_namespace": policy.get("vector_namespace", "metadata-only"),
        "practice_area": practice_area,
        "issue_tags": issue_tags or [],
        "review_status": source.get("review_status", "lawyer_review_required"),
        "answer_layer_status": policy.get("default_answer_layer_status", "research_only"),
        "chunk_id": chunk["chunk_id"],
        "chunk_hash": chunk["chunk_hash"],
        "pinpoint": chunk.get("pinpoint", ""),
        "text_ref": chunk.get("text_ref", ""),
        "embedding_model": embedding_model,
    }
    missing = [field for field in REQUIRED_VECTOR_FILTERS if payload.get(field) in (None, "", [])]
    if missing:
        raise ValueError(f"vector payload missing required filters: {', '.join(missing)}")
    if payload["visibility"] in {"firm_private", "licensed_private"} and not payload["vector_namespace"].startswith("private:"):
        raise ValueError("private/licensed source must use a private vector namespace")
    return {
        "id": chunk["chunk_id"],
        "vector": {"status": "embedding_required", "text_ref": chunk.get("text_ref", "")},
        "payload": payload,
    }


def build_vector_manifest(
    *,
    source: dict[str, Any],
    chunks: list[dict[str, Any]],
    practice_area: str,
    issue_tags: list[str] | None = None,
    embedding_model: str = "adapter-configured",
) -> dict[str, Any]:
    points = [
        vector_point_manifest(
            chunk,
            source,
            practice_area=practice_area,
            issue_tags=issue_tags,
            embedding_model=embedding_model,
        )
        for chunk in chunks
    ]
    return {
        "manifest_version": "1.0",
        "source_id": source["source_id"],
        "vector_namespace": source.get("rag_policy", {}).get("vector_namespace", "metadata-only"),
        "backend_targets": ["qdrant", "pgvector"],
        "embedding_model": embedding_model,
        "points": points,
    }
