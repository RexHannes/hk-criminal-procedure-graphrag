#!/usr/bin/env python3
"""Validate the inconsistent-pleadings legal ingest vertical."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
VERTICAL = ROOT / "data" / "legal_ingest" / "verticals" / "inconsistent_pleadings.json"
CORE_MIGRATION = ROOT / "supabase" / "migrations" / "20260611000000_create_legal_ingest_core_tables.sql"
LINK_MIGRATION = ROOT / "supabase" / "migrations" / "20260612000000_create_proposition_node_links.sql"

FORBIDDEN_PUBLIC_KEYS = {
    "full_text",
    "body_text",
    "document_text",
    "raw_text",
    "precedent_text",
    "book_text",
    "template_text",
    "wording",
}

REQUIRED_FORM_IDS = {
    "form_pleading_inconsistency_matrix",
    "form_strikeout_stay_summons_candidate",
    "form_affirmation_exhibiting_inconsistent_pleadings",
    "form_skeleton_argument_abuse_estoppel_collateral_attack",
    "form_costs_submission_inconsistent_positions",
    "form_cross_examination_note_inconsistent_statements",
}

REQUIRED_ISSUES = {
    "abuse_of_process",
    "estoppel",
    "collateral_attack",
    "strike_out",
    "stay",
    "credibility",
    "costs",
}


def load(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def walk_forbidden(obj: Any, path: str = "$") -> list[str]:
    errors: list[str] = []
    if isinstance(obj, dict):
        for key, value in obj.items():
            if key in FORBIDDEN_PUBLIC_KEYS:
                errors.append(f"{path}.{key} is forbidden in public vertical data")
            errors.extend(walk_forbidden(value, f"{path}.{key}"))
    elif isinstance(obj, list):
        for idx, value in enumerate(obj):
            errors.extend(walk_forbidden(value, f"{path}[{idx}]"))
    return errors


def main() -> int:
    errors: list[str] = []
    vertical = load(VERTICAL)
    sources = {s.get("source_id"): s for s in vertical.get("source_registry", [])}
    paragraphs = {p.get("paragraph_id"): p for p in vertical.get("legal_paragraphs", [])}
    propositions = vertical.get("proposition_cards", [])
    forms = {f.get("form_id"): f for f in vertical.get("form_metadata", [])}
    contracts = vertical.get("answer_contracts", [])

    if vertical.get("vertical_id") != "inconsistent_pleadings_across_proceedings":
      errors.append("Wrong vertical_id.")
    if len(sources) < 5:
        errors.append("Expected at least five public judgment source records.")
    if len(propositions) < 5:
        errors.append("Expected at least five proposition cards.")
    if set(forms) != REQUIRED_FORM_IDS:
        errors.append(f"Form IDs mismatch: {sorted(set(forms) ^ REQUIRED_FORM_IDS)}")

    for source_id, source in sources.items():
        if source.get("source_type") != "case":
            errors.append(f"{source_id}: expected source_type case")
        if source.get("license_status") != "public_judgment":
            errors.append(f"{source_id}: expected public_judgment license")
        if not re.fullmatch(r"[0-9a-f]{64}", source.get("checksum", "")):
            errors.append(f"{source_id}: checksum must be sha256 hex placeholder/real hash")

    for paragraph_id, paragraph in paragraphs.items():
        if paragraph.get("source_id") not in sources:
            errors.append(f"{paragraph_id}: unknown source_id")
        if paragraph.get("answer_layer_status") == "answer_safe":
            errors.append(f"{paragraph_id}: paragraph cannot be answer_safe")
        if not paragraph.get("paragraph_text"):
            errors.append(f"{paragraph_id}: missing paragraph_text/excerpt")

    seen_issue_tags: set[str] = set()
    for card in propositions:
        proposition_id = card.get("proposition_id")
        source_id = card.get("source_id")
        paragraph_id = card.get("paragraph_id")
        paragraph = paragraphs.get(paragraph_id)
        if source_id not in sources:
            errors.append(f"{proposition_id}: source_id missing from registry")
        if paragraph is None:
            errors.append(f"{proposition_id}: paragraph_id missing from paragraphs")
            continue
        quote = card.get("supporting_quote", "")
        if quote not in paragraph.get("paragraph_text", ""):
            errors.append(f"{proposition_id}: supporting_quote not found in paragraph_text")
        if not card.get("citation") or not card.get("pinpoint"):
            errors.append(f"{proposition_id}: citation and pinpoint required")
        if card.get("answer_layer_status") == "answer_safe":
            errors.append(f"{proposition_id}: no machine card may be answer_safe")
        if card.get("verification_status") == "verified" and card.get("review_status") != "approved":
            errors.append(f"{proposition_id}: verified requires approved review")
        seen_issue_tags.update(card.get("issue_tags", []))

    for form_id, form in forms.items():
        if form.get("copyright_status") != "metadata_only_no_full_text_reproduced":
            errors.append(f"{form_id}: form must be metadata only")
        if form.get("output_mode") != "draft_only_lawyer_review_required":
            errors.append(f"{form_id}: output must be draft only")
        if not form.get("required_facts") or not form.get("field_schema"):
            errors.append(f"{form_id}: required_facts and field_schema required")

    if not contracts:
        errors.append("Missing answer contract.")
    else:
        contract_issues = set(contracts[0].get("primary_issues", []))
        if not REQUIRED_ISSUES.issubset(contract_issues):
            errors.append(f"Answer contract missing issues: {sorted(REQUIRED_ISSUES - contract_issues)}")
        if contracts[0].get("source_audit_policy") != "collapsed_by_default":
            errors.append("Source audit must be collapsed by default.")

    migration_order = [p.name for p in sorted((ROOT / "supabase" / "migrations").glob("*.sql"))]
    if CORE_MIGRATION.name not in migration_order or LINK_MIGRATION.name not in migration_order:
        errors.append("Required migrations missing.")
    elif migration_order.index(CORE_MIGRATION.name) > migration_order.index(LINK_MIGRATION.name):
        errors.append("Core legal ingest migration must run before proposition_node_links migration.")

    errors.extend(walk_forbidden(vertical))

    if errors:
        print("Inconsistent pleadings vertical validation failed:")
        for error in errors:
            print(f"- {error}")
        return 1
    print(
        "Inconsistent pleadings vertical validation passed: "
        f"{len(sources)} sources, {len(paragraphs)} paragraphs, {len(propositions)} propositions, {len(forms)} forms."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
