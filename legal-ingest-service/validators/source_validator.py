"""Validation gates for legal source cards."""

from __future__ import annotations

from typing import Any


PROHIBITED_LICENSES = {"prohibited"}
PRIVATE_SOURCE_TYPES = {"firm_precedent", "licensed_book", "private_doctrine_note"}


def validate_source_registry_record(record: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    required = ["source_id", "source_type", "title", "jurisdiction", "license_status", "storage_policy", "checksum", "ingest_status", "review_status"]
    for field in required:
        if not record.get(field):
            errors.append(f"source missing {field}")
    if record.get("source_type") in PRIVATE_SOURCE_TYPES and record.get("storage_policy") != "private_vault_only":
        errors.append(f"{record.get('source_id')}: private source must use private_vault_only")
    if record.get("license_status") in PROHIBITED_LICENSES and record.get("ingest_status") != "blocked":
        errors.append(f"{record.get('source_id')}: prohibited source must be blocked")
    return errors


def validate_proposition_against_source(proposition: dict[str, Any], source_text: str) -> list[str]:
    errors: list[str] = []
    if not proposition.get("source_id"):
        errors.append("proposition missing source_id")
    if not proposition.get("supporting_quote"):
        errors.append("proposition missing supporting_quote")
    elif proposition["supporting_quote"] not in source_text:
        errors.append(f"{proposition.get('proposition_id')}: supporting_quote not found in source text")
    if not proposition.get("authority_role"):
        errors.append(f"{proposition.get('proposition_id')}: authority_role missing")
    if proposition.get("answer_layer_status") == "answer_safe" and proposition.get("review_status") != "approved":
        errors.append(f"{proposition.get('proposition_id')}: answer_safe requires approved review")
    if proposition.get("verification_status") == "verified" and proposition.get("review_status") != "approved":
        errors.append(f"{proposition.get('proposition_id')}: verified requires approved review")
    return errors

