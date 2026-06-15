#!/usr/bin/env python3
"""Validate Legal Ingest Phase 1 schemas, samples, and public-safety gates."""

from __future__ import annotations

import importlib.util
import json
import re
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
SCHEMA_DIR = ROOT / "data" / "legal_ingest" / "schemas"
SAMPLE_DIR = ROOT / "data" / "legal_ingest" / "samples"
SERVICE_DIR = ROOT / "legal-ingest-service"
WORKFLOW_SPEC = SERVICE_DIR / "app" / "inngest_workflows.json"

FORBIDDEN_PUBLIC_KEYS = {
    "full_text",
    "body_text",
    "document_text",
    "raw_text",
    "precedent_text",
    "clause_text",
    "book_text",
    "template_text",
    "wording",
}

PRIVATE_SOURCE_TYPES = {"firm_precedent", "licensed_book", "private_doctrine_note"}
PRIVATE_LICENSES = {"firm_private", "licensed_private"}
PROHIBITED_LICENSES = {"prohibited"}


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def walk_forbidden(obj: Any, path: str = "$") -> list[str]:
    errors: list[str] = []
    if isinstance(obj, dict):
        for key, value in obj.items():
            if key in FORBIDDEN_PUBLIC_KEYS:
                errors.append(f"{path}.{key} is forbidden in public legal-ingest metadata")
            errors.extend(walk_forbidden(value, f"{path}.{key}"))
    elif isinstance(obj, list):
        for idx, value in enumerate(obj):
            errors.extend(walk_forbidden(value, f"{path}[{idx}]"))
    return errors


def validate_schema_shape(name: str, schema: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    if schema.get("$schema") != "https://json-schema.org/draft/2020-12/schema":
        errors.append(f"{name}: schema draft missing")
    if schema.get("type") != "object":
        errors.append(f"{name}: root type must be object")
    if not schema.get("required"):
        errors.append(f"{name}: required fields missing")
    if schema.get("additionalProperties") is not False:
        errors.append(f"{name}: additionalProperties must be false")
    return errors


def minimal_validate(schema: dict[str, Any], record: dict[str, Any], label: str) -> list[str]:
    errors: list[str] = []
    required = schema.get("required", [])
    props = schema.get("properties", {})
    for field in required:
        if field not in record or record[field] in (None, "", []):
            errors.append(f"{label}: missing required field {field}")
    for field in record:
        if field not in props:
            errors.append(f"{label}: unexpected field {field}")
    for field, spec in props.items():
        if field not in record:
            continue
        value = record[field]
        if "enum" in spec and value not in spec["enum"]:
            errors.append(f"{label}: {field} has unsupported value {value!r}")
        if "pattern" in spec and isinstance(value, str) and not re.fullmatch(spec["pattern"], value):
            errors.append(f"{label}: {field} does not match pattern")
        if spec.get("type") == "array" and not isinstance(value, list):
            errors.append(f"{label}: {field} must be array")
        if spec.get("type") == "string" and not isinstance(value, str):
            errors.append(f"{label}: {field} must be string")
    return errors


def import_module(path: Path, module_name: str):
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot import {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def validate_sources(records: list[dict[str, Any]], schema: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    seen: set[str] = set()
    for record in records:
        source_id = record.get("source_id", "<missing>")
        errors.extend(minimal_validate(schema, record, f"source {source_id}"))
        if source_id in seen:
            errors.append(f"duplicate source_id {source_id}")
        seen.add(source_id)
        if record.get("source_type") in PRIVATE_SOURCE_TYPES and record.get("storage_policy") != "private_vault_only":
            errors.append(f"{source_id}: private source type must use private_vault_only")
        if record.get("license_status") in PRIVATE_LICENSES and record.get("visibility") not in {"firm_private", "licensed_private"}:
            errors.append(f"{source_id}: private/licensed source must not be public visibility")
        if record.get("license_status") in PROHIBITED_LICENSES and record.get("ingest_status") != "blocked":
            errors.append(f"{source_id}: prohibited source must be blocked")
        if record.get("source_type") in {"case", "legislation", "practice_direction"} and not record.get("citation"):
            errors.append(f"{source_id}: public law source should carry citation")
    return errors


def validate_propositions(cards: list[dict[str, Any]], schema: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    for card in cards:
        proposition_id = card.get("proposition_id", "<missing>")
        errors.extend(minimal_validate(schema, card, f"proposition {proposition_id}"))
        if card.get("answer_layer_status") == "answer_safe" and card.get("review_status") != "approved":
            errors.append(f"{proposition_id}: answer_safe requires approved review")
        if card.get("verification_status") == "verified" and card.get("review_status") != "approved":
            errors.append(f"{proposition_id}: verified requires approved review")
        if card.get("authority_role") == "party_argument" and card.get("answer_layer_status") == "answer_safe":
            errors.append(f"{proposition_id}: party argument cannot be answer_safe")
    return errors


def validate_forms(forms: list[dict[str, Any]], schema: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    for form in forms:
        form_id = form.get("form_id", "<missing>")
        errors.extend(minimal_validate(schema, form, f"form {form_id}"))
        if form.get("review_status") == "approved":
            errors.append(f"{form_id}: sample form cannot be approved")
        if form.get("copyright_status") != "metadata_only_no_full_text_reproduced":
            errors.append(f"{form_id}: public sample must be metadata-only")
        if not form.get("field_schema"):
            errors.append(f"{form_id}: expected metadata field_schema")
    return errors


def validate_answer_contracts(contracts: list[dict[str, Any]], schema: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    for idx, contract in enumerate(contracts):
        errors.extend(minimal_validate(schema, contract, f"answer_contract[{idx}]"))
        if "No paragraph citation" not in contract.get("verification_rule", ""):
            errors.append(f"answer_contract[{idx}]: verification_rule must enforce paragraph citation gate")
        if contract.get("source_audit_policy") != "collapsed_by_default":
            errors.append(f"answer_contract[{idx}]: source audit should be collapsed by default")
    return errors


def validate_service_helpers() -> list[str]:
    errors: list[str] = []
    case_parser = import_module(SERVICE_DIR / "parsers" / "case_parser.py", "case_parser")
    cards = case_parser.parse_case_text_to_paragraphs(
        source_id="sample_case",
        citation="[2026] HKCFI 1",
        text="[1] First paragraph.\ncontinued line.\n[2] Second paragraph.",
    )
    if len(cards) != 2 or cards[0].get("para_no") != "1":
        errors.append("case_parser did not preserve numbered paragraphs")

    extractor = import_module(SERVICE_DIR / "extractors" / "proposition_extractor.py", "proposition_extractor")
    try:
        candidate = extractor.make_candidate_proposition(
            source_id="sample_case",
            paragraph_id="sample_case_p1",
            paragraph_text="The court may stay proceedings as an abuse of process.",
            proposition_text="The court may stay proceedings as an abuse of process.",
            supporting_quote="stay proceedings as an abuse of process",
            issue_tags=["abuse_of_process"],
        )
        if candidate.get("answer_layer_status") != "research_only":
            errors.append("candidate proposition should be research_only")
    except Exception as exc:
        errors.append(f"proposition extractor rejected valid quote: {exc}")
    try:
        extractor.make_candidate_proposition(
            source_id="sample_case",
            paragraph_id="sample_case_p1",
            paragraph_text="The court may stay proceedings.",
            proposition_text="Unsupported proposition.",
            supporting_quote="not present",
            issue_tags=["abuse_of_process"],
        )
        errors.append("proposition extractor accepted missing quote")
    except ValueError:
        pass

    qdrant = import_module(SERVICE_DIR / "indexers" / "qdrant_payloads.py", "qdrant_payloads")
    try:
        payload = qdrant.proposition_payload(candidate, source_type="case", practice_area="civil_procedure", visibility="public_source")
        for field in qdrant.REQUIRED_PAYLOAD_FIELDS:
            if field not in payload:
                errors.append(f"Qdrant payload missing {field}")
    except Exception as exc:
        errors.append(f"Qdrant payload builder failed valid candidate: {exc}")
    return errors


def main() -> int:
    errors: list[str] = []
    schemas = {
        "source_registry": load_json(SCHEMA_DIR / "source_registry.schema.json"),
        "proposition_card": load_json(SCHEMA_DIR / "proposition_card.schema.json"),
        "form_metadata": load_json(SCHEMA_DIR / "form_metadata.schema.json"),
        "answer_contract": load_json(SCHEMA_DIR / "answer_contract.schema.json"),
    }
    for name, schema in schemas.items():
        errors.extend(validate_schema_shape(name, schema))

    sources = load_json(SAMPLE_DIR / "source_registry.sample.json").get("sources", [])
    propositions = load_json(SAMPLE_DIR / "proposition_cards.sample.json").get("proposition_cards", [])
    forms = load_json(SAMPLE_DIR / "form_metadata.sample.json").get("forms", [])
    contracts = load_json(SAMPLE_DIR / "answer_contract.sample.json").get("answer_contracts", [])
    paragraph_cards = load_json(SAMPLE_DIR / "legal_paragraph_cards.sample.json").get("paragraph_cards", [])
    workflows = load_json(WORKFLOW_SPEC).get("workflows", [])

    errors.extend(validate_sources(sources, schemas["source_registry"]))
    errors.extend(validate_propositions(propositions, schemas["proposition_card"]))
    errors.extend(validate_forms(forms, schemas["form_metadata"]))
    errors.extend(validate_answer_contracts(contracts, schemas["answer_contract"]))

    source_ids = {record.get("source_id") for record in sources}
    paragraph_ids = {record.get("paragraph_id") for record in paragraph_cards}
    for card in propositions:
        if card.get("source_id") not in source_ids:
            errors.append(f"{card.get('proposition_id')}: source_id not in registry sample")
        if card.get("paragraph_id") and card.get("paragraph_id") not in paragraph_ids:
            errors.append(f"{card.get('proposition_id')}: paragraph_id not in paragraph card sample")

    if not workflows:
        errors.append("Inngest workflow spec has no workflows")
    for workflow in workflows:
        if not workflow.get("event", "").startswith("legal/"):
            errors.append(f"workflow event invalid: {workflow.get('event')}")
        if not workflow.get("steps"):
            errors.append(f"workflow {workflow.get('event')} has no steps")

    for path in list(SAMPLE_DIR.glob("*.json")) + list(SCHEMA_DIR.glob("*.json")):
        errors.extend(walk_forbidden(load_json(path), path.name))

    errors.extend(validate_service_helpers())

    report = {
        "schemas_checked": sorted(schemas),
        "sources_checked": len(sources),
        "paragraph_cards_checked": len(paragraph_cards),
        "proposition_cards_checked": len(propositions),
        "forms_checked": len(forms),
        "answer_contracts_checked": len(contracts),
        "workflows_checked": len(workflows),
        "errors": errors,
    }
    report_path = ROOT / "data" / "legal_ingest" / "reports" / "phase1_validation_report.json"
    try:
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    except PermissionError:
        report_path = Path("/tmp/legal_ingest_phase1_validation_report.json")
        report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    if errors:
        print("Legal ingest Phase 1 validation failed:")
        for error in errors:
            print(f"- {error}")
        return 1
    print(
        "Legal ingest Phase 1 validation passed: "
        f"{len(sources)} sources, {len(propositions)} propositions, {len(forms)} forms, {len(workflows)} workflows. "
        f"Report: {report_path}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
