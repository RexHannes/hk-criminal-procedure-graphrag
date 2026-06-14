#!/usr/bin/env python3
"""Validate public-safe PI form inventory and field schema outputs."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TORT_DIR = ROOT / "data" / "legal_domain_packs" / "demo_maps" / "tort_law_hk"
INVENTORY = TORT_DIR / "pi_form_inventory.json"
FIELD_SCHEMAS = TORT_DIR / "pi_form_field_schemas.json"
VAULT_SCHEMA = TORT_DIR / "pi_template_vault_schema.json"
PRINCIPLES = TORT_DIR / "nodes" / "11_personal_injury_principles.json"
PROCEDURES = TORT_DIR / "nodes" / "12_personal_injury_procedures.json"

FORBIDDEN_KEYS = {
    "full_text",
    "body_text",
    "paragraph_text",
    "document_text",
    "raw_text",
    "precedent_text",
    "clause_text",
    "wording",
}


def load(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def walk_forbidden(obj, path="$"):
    errors = []
    if isinstance(obj, dict):
        for key, value in obj.items():
            if key in FORBIDDEN_KEYS:
                errors.append(f"{path}.{key} is forbidden in public PI form metadata")
            errors.extend(walk_forbidden(value, f"{path}.{key}"))
    elif isinstance(obj, list):
        for idx, value in enumerate(obj):
            errors.extend(walk_forbidden(value, f"{path}[{idx}]"))
    return errors


def main() -> int:
    errors: list[str] = []
    inventory = load(INVENTORY)
    field_schemas = load(FIELD_SCHEMAS)
    vault_schema = load(VAULT_SCHEMA)
    principle_ids = {n.get("doctrine_node_id") for n in load(PRINCIPLES).get("nodes", [])}
    procedure_ids = {n.get("id") for n in load(PROCEDURES).get("nodes", [])}
    schema_by_id = {s.get("form_id"): s for s in field_schemas.get("field_schemas", [])}

    forms = inventory.get("forms", [])
    if not forms:
        errors.append("Inventory has no forms.")

    seen = set()
    for rec in forms:
        form_id = rec.get("form_id")
        if not form_id:
            errors.append("Form missing form_id.")
            continue
        if form_id in seen:
            errors.append(f"Duplicate form_id: {form_id}")
        seen.add(form_id)
        for field in ["title", "source_filename", "source_archive", "source_hash", "form_family", "required_facts", "linked_procedure_nodes", "review_status", "output_mode"]:
            if not rec.get(field):
                errors.append(f"{form_id}: missing {field}")
        if not re.fullmatch(r"[0-9a-f]{64}", rec.get("source_hash", "")):
            errors.append(f"{form_id}: source_hash is not a SHA256 hex digest")
        if rec.get("review_status") == "approved":
            errors.append(f"{form_id}: machine ingestion cannot mark approved")
        if rec.get("output_mode") != "draft_only_lawyer_review_required":
            errors.append(f"{form_id}: output_mode must be draft_only_lawyer_review_required")
        if rec.get("copyright_status") != "metadata_only_no_full_text_reproduced":
            errors.append(f"{form_id}: copyright_status must be metadata_only_no_full_text_reproduced")
        if str(rec.get("source_archive", "")).startswith("/") or str(rec.get("source_member", "")).startswith("/"):
            errors.append(f"{form_id}: must not expose absolute local source paths")
        if form_id not in schema_by_id:
            errors.append(f"{form_id}: missing field schema")
        for pid in rec.get("linked_principle_nodes", []):
            if pid not in principle_ids:
                errors.append(f"{form_id}: unknown linked principle node {pid}")
        for sid in rec.get("linked_procedure_nodes", []):
            if sid not in procedure_ids:
                errors.append(f"{form_id}: unknown linked procedure node {sid}")

    for schema in field_schemas.get("field_schemas", []):
        form_id = schema.get("form_id")
        if form_id not in seen:
            errors.append(f"Field schema references unknown form_id: {form_id}")
        if schema.get("schema_status") == "approved":
            errors.append(f"{form_id}: schema cannot be approved by machine ingestion")
        for field in schema.get("fields", []):
            if not field.get("field_id") or not field.get("label"):
                errors.append(f"{form_id}: field missing field_id/label")
            if field.get("review_status") == "approved":
                errors.append(f"{form_id}: field cannot be approved by machine ingestion")

    if vault_schema.get("schema_id") != "pi_template_vault_schema":
        errors.append("Template vault schema missing expected schema_id.")
    if "private_storage_required" not in vault_schema.get("policies", []):
        errors.append("Template vault schema must require private storage.")

    errors.extend(walk_forbidden(inventory))
    errors.extend(walk_forbidden(field_schemas))
    errors.extend(walk_forbidden(vault_schema))

    if errors:
        print("PI form validation failed:")
        for error in errors:
            print(f"- {error}")
        return 1
    print(f"PI form validation passed: {len(forms)} inventory records, {len(schema_by_id)} field schemas.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
