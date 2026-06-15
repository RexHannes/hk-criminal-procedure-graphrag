"""Candidate proposition extraction helpers.

Production may call an LLM through this boundary. Phase 1 keeps a deterministic
helper that enforces exact-quote support and research-only status.
"""

from __future__ import annotations

import re
from typing import Any


def make_candidate_proposition(
    *,
    source_id: str,
    paragraph_id: str,
    paragraph_text: str,
    proposition_text: str,
    supporting_quote: str,
    issue_tags: list[str],
    jurisdiction: str = "Hong Kong",
    authority_role: str = "applied_principle",
) -> dict[str, Any]:
    if supporting_quote not in paragraph_text:
        raise ValueError("supporting_quote must be textually present in source paragraph")
    slug = re.sub(r"[^a-z0-9]+", "_", proposition_text.lower()).strip("_")[:48] or "candidate"
    return {
        "proposition_id": f"prop_{source_id}_{paragraph_id}_{slug}",
        "source_id": source_id,
        "paragraph_id": paragraph_id,
        "proposition_text": proposition_text,
        "supporting_quote": supporting_quote,
        "issue_tags": issue_tags,
        "jurisdiction": jurisdiction,
        "authority_role": authority_role,
        "confidence": "low",
        "verification_status": "machine_candidate",
        "answer_layer_status": "research_only",
        "review_status": "unreviewed",
    }

