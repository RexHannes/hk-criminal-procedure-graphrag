"""Helpers for retrieved-law and SOP/playbook cache records.

The cache is intentionally conservative:
- it fingerprints the query and source bundle;
- it never upgrades research-only material into answer-safe output;
- it marks cached answers stale when source fingerprints change.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any


ANSWER_SAFE_STATUSES = {"answer_safe"}
REUSABLE_STATUSES = {"source_verified", "answer_safe"}
REVIEW_APPROVED = {"approved"}


def _stable_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(",", ":"))


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def normalize_query(query: str) -> str:
    return " ".join(query.strip().lower().split())


def query_hash(query: str) -> str:
    return sha256_text(normalize_query(query))


def source_fingerprint(
    *,
    source_card_ids: list[str] | None = None,
    proposition_ids: list[str] | None = None,
    paragraph_ids: list[str] | None = None,
    form_ids: list[str] | None = None,
    review_statuses: dict[str, str] | None = None,
) -> str:
    payload = {
        "source_card_ids": sorted(source_card_ids or []),
        "proposition_ids": sorted(proposition_ids or []),
        "paragraph_ids": sorted(paragraph_ids or []),
        "form_ids": sorted(form_ids or []),
        "review_statuses": dict(sorted((review_statuses or {}).items())),
    }
    return sha256_text(_stable_json(payload))


def build_retrieval_bundle_record(
    *,
    bundle_id: str,
    query: str,
    domain: str,
    source_card_ids: list[str],
    proposition_ids: list[str],
    paragraph_ids: list[str],
    form_ids: list[str] | None = None,
    scenario_family: str | None = None,
    scenario_subtype: str | None = None,
    user_perspective: str | None = None,
    retrieval_filters: dict[str, Any] | None = None,
    retrieval_summary: dict[str, Any] | None = None,
    source_audit: dict[str, Any] | None = None,
    review_statuses: dict[str, str] | None = None,
    retrieval_status: str = "research_only",
    review_status: str = "unreviewed",
) -> dict[str, Any]:
    return {
        "bundle_id": bundle_id,
        "query_hash": query_hash(query),
        "normalized_query": normalize_query(query),
        "domain": domain,
        "scenario_family": scenario_family,
        "scenario_subtype": scenario_subtype,
        "user_perspective": user_perspective,
        "corpus_fingerprint": source_fingerprint(
            source_card_ids=source_card_ids,
            proposition_ids=proposition_ids,
            paragraph_ids=paragraph_ids,
            form_ids=form_ids or [],
            review_statuses=review_statuses or {},
        ),
        "source_card_ids": source_card_ids,
        "proposition_ids": proposition_ids,
        "paragraph_ids": paragraph_ids,
        "form_ids": form_ids or [],
        "retrieval_filters": retrieval_filters or {},
        "retrieval_summary": retrieval_summary or {},
        "source_audit": source_audit or {},
        "retrieval_status": retrieval_status,
        "review_status": review_status,
    }


def can_reuse_cached_answer(
    *,
    cached_source_fingerprint: str,
    current_source_fingerprint: str,
    answer_status: str,
    review_status: str,
    allow_research_only: bool = False,
) -> tuple[bool, list[str]]:
    reasons: list[str] = []
    if cached_source_fingerprint != current_source_fingerprint:
        reasons.append("source_fingerprint_changed")
    if answer_status not in REUSABLE_STATUSES:
        if allow_research_only and answer_status == "research_only":
            reasons.append("research_only_reuse")
        else:
            reasons.append("answer_status_not_reusable")
    if answer_status in ANSWER_SAFE_STATUSES and review_status not in REVIEW_APPROVED:
        reasons.append("answer_safe_without_approved_review")
    if review_status == "rejected":
        reasons.append("review_rejected")
    blocking = [
        reason
        for reason in reasons
        if reason not in {"research_only_reuse"}
    ]
    return not blocking, reasons


def build_answer_snapshot_record(
    *,
    answer_id: str,
    bundle_id: str,
    query: str,
    answer_json: dict[str, Any],
    source_fingerprint_value: str,
    contract_id: str | None = None,
    answer_mode: str = "professional_source_gated",
    unsupported_claims: list[dict[str, Any]] | None = None,
    verification_report: dict[str, Any] | None = None,
    answer_status: str = "research_only",
    review_status: str = "unreviewed",
) -> dict[str, Any]:
    return {
        "answer_id": answer_id,
        "bundle_id": bundle_id,
        "contract_id": contract_id,
        "query_hash": query_hash(query),
        "answer_mode": answer_mode,
        "answer_json": answer_json,
        "source_fingerprint": source_fingerprint_value,
        "unsupported_claims": unsupported_claims or [],
        "verification_report": verification_report or {},
        "answer_status": answer_status,
        "review_status": review_status,
    }


def build_sop_playbook_record(
    *,
    playbook_id: str,
    domain: str,
    scenario_family: str,
    title: str,
    source_fingerprint_value: str,
    steps: list[dict[str, Any]],
    forms_or_documents: list[dict[str, Any]] | None = None,
    missing_facts: list[dict[str, Any]] | None = None,
    source_card_ids: list[str] | None = None,
    proposition_ids: list[str] | None = None,
    form_ids: list[str] | None = None,
    scenario_subtype: str | None = None,
    contract_id: str | None = None,
    retrieval_bundle_id: str | None = None,
    answer_snapshot_id: str | None = None,
    status: str = "draft",
    review_status: str = "lawyer_review_required",
    firm_id: str | None = None,
) -> dict[str, Any]:
    return {
        "playbook_id": playbook_id,
        "domain": domain,
        "scenario_family": scenario_family,
        "scenario_subtype": scenario_subtype,
        "title": title,
        "contract_id": contract_id,
        "retrieval_bundle_id": retrieval_bundle_id,
        "answer_snapshot_id": answer_snapshot_id,
        "steps": steps,
        "forms_or_documents": forms_or_documents or [],
        "missing_facts": missing_facts or [],
        "source_card_ids": source_card_ids or [],
        "proposition_ids": proposition_ids or [],
        "form_ids": form_ids or [],
        "source_fingerprint": source_fingerprint_value,
        "status": status,
        "review_status": review_status,
        "firm_id": firm_id,
    }
