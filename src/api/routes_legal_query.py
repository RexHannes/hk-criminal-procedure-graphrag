"""Public and private legal-query demo routes.

The FastAPI demo returns transparent, source-audit friendly structures. It does
not generate final legal advice and does not accept private ingestion by
default.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from .auth import AuthContext, public_auth_context, require_private_auth
from .settings import get_settings


router = APIRouter()


class LegalQueryRequest(BaseModel):
    query: str = Field(min_length=3)
    mode: str = "research"
    top_k: int = Field(default=5, ge=1, le=20)


def _sop_markdown(query: str, source_mode: str) -> str:
    return "\n".join(
        [
            "# Source-Gated HK Legal Research SOP",
            "",
            f"- Query: {query}",
            f"- Source mode: {source_mode}",
            "- Step 1: classify domain, task, posture, and missing facts.",
            "- Step 2: retrieve public-demo source cards with tenant/source filters.",
            "- Step 3: separate principles, procedures/forms, evidence, and caveats.",
            "- Step 4: cite every legal proposition or move it to cannot-verify.",
            "- Step 5: export forms/documents as candidates only until lawyer review.",
        ]
    )


def _demo_answer(payload: LegalQueryRequest, auth: AuthContext) -> dict[str, Any]:
    return {
        "answer_mode": "source_gated_demo",
        "source_mode": auth.source_mode,
        "tenant_id": auth.tenant_id,
        "short_answer": "This hosted demo is configured for public/demo source cards only. It returns a transparent answer skeleton and SOP export shape; final legal propositions must be backed by retrieved source cards.",
        "sections": [
            {
                "heading": "Principles",
                "items": ["Show only rules supported by public/demo source cards."],
            },
            {
                "heading": "Procedures / Forms",
                "items": ["Attach candidate forms or SOP steps only when form metadata is retrieved."],
            },
            {
                "heading": "Source Audit",
                "items": ["Raw retrieval chunks, scores, and source metadata belong in a collapsed audit trail."],
            },
        ],
        "forms_or_documents": [
            {
                "title": "SOP Markdown Export",
                "format": "markdown",
                "status": "modifiable_candidate",
            }
        ],
        "missing_facts": [],
        "cannot_verify": ["The FastAPI demo route does not yet call the Node source-gated answer engine inside this container."],
        "sop_markdown": _sop_markdown(payload.query, auth.source_mode),
    }


@router.post("/api/legal-query")
def public_legal_query(payload: LegalQueryRequest) -> dict[str, Any]:
    return _demo_answer(payload, public_auth_context())


@router.post("/api/private/legal-query")
def private_legal_query(payload: LegalQueryRequest, auth: AuthContext = Depends(require_private_auth)) -> dict[str, Any]:
    return _demo_answer(payload, auth)


@router.post("/api/private/ingest")
def private_ingest(auth: AuthContext = Depends(require_private_auth)) -> dict[str, Any]:
    settings = get_settings()
    if not settings.private_source_ingestion_enabled:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="private_source_ingestion_disabled")
    if not auth.is_authenticated or auth.tenant_id == "public":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="tenant_auth_required")
    return {
        "status": "disabled_in_demo_scaffold",
        "tenant_id": auth.tenant_id,
        "message": "Private ingestion requires tenant isolation, audit logging, source-policy review, and lawyer review before activation.",
    }
