"""Hybrid reranking with legal source gates.

This is deliberately simple and deterministic for local validation. Production
can replace the lexical score with BM25/vector/cross-encoder scores while
preserving the same source gates and output contract.
"""

from __future__ import annotations

import re
from typing import Any


ANSWER_SAFE_STATUSES = {"answer_safe"}
VERIFIED_STATUSES = {"answer_safe", "paragraph_verified", "source_verified", "verified"}
PRIVATE_VISIBILITY = {"firm_private", "licensed_private"}


def tokenize(text: str) -> list[str]:
    return [t for t in re.split(r"[^a-z0-9]+", text.lower()) if len(t) >= 2]


def lexical_score(query: str, candidate: dict[str, Any]) -> float:
    terms = tokenize(query)
    blob = " ".join(
        str(x)
        for x in [
            candidate.get("title", ""),
            candidate.get("proposition_text", ""),
            candidate.get("paragraph_text", ""),
            candidate.get("supporting_quote", ""),
            " ".join(candidate.get("issue_tags", []) or []),
        ]
    ).lower()
    return sum(1.0 for term in terms if term in blob)


def source_gate(candidate: dict[str, Any], *, include_private: bool = False) -> tuple[bool, list[str]]:
    warnings: list[str] = []
    visibility = candidate.get("visibility", "public_source")
    answer_layer = candidate.get("answer_layer_status", "research_only")
    review = candidate.get("review_status", "lawyer_review_required")

    if visibility in PRIVATE_VISIBILITY and not include_private:
        return False, ["private_source_excluded"]
    if answer_layer not in VERIFIED_STATUSES:
        warnings.append("research_only_not_answer_safe")
    if answer_layer == "answer_safe" and review != "approved":
        return False, ["invalid_answer_safe_without_approval"]
    if not candidate.get("citation") or not candidate.get("pinpoint"):
        warnings.append("missing_citation_or_pinpoint")
    if not candidate.get("supporting_quote"):
        warnings.append("missing_supporting_quote")
    return True, warnings


def rerank_source_cards(
    query: str,
    candidates: list[dict[str, Any]],
    *,
    include_private: bool = False,
    limit: int = 8,
) -> dict[str, Any]:
    ranked: list[dict[str, Any]] = []
    excluded: list[dict[str, Any]] = []
    for candidate in candidates:
        allowed, warnings = source_gate(candidate, include_private=include_private)
        scored = {
            **candidate,
            "score": lexical_score(query, candidate),
            "warnings": warnings,
            "can_support_final_answer": candidate.get("answer_layer_status") in ANSWER_SAFE_STATUSES and not warnings,
        }
        if allowed:
            ranked.append(scored)
        else:
            excluded.append(scored)

    ranked.sort(key=lambda item: (-item["score"], item.get("citation", ""), item.get("pinpoint", "")))
    return {
        "retrieval_mode": "hybrid_source_gated_v1",
        "query": query,
        "results": ranked[:limit],
        "excluded": excluded,
        "answer_contract": {
            "main_answer_may_use": "answer_safe cards only",
            "research_answer_may_show": "research_only cards with warnings and audit trail",
            "private_sources": "included only when include_private=true and namespace authorization passes",
        },
    }
