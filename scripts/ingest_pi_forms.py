#!/usr/bin/env python3
"""Metadata-only ingestion for private PI form banks.

The script inventories DOCX files from local folders or ZIP archives and writes
public-safe metadata only: filename, hash, structural counts, inferred family,
trigger conditions, required facts, linked PI nodes, and placeholder schema.

It deliberately does not emit full paragraph text or precedent wording.
Optional DeepSeek assistance may be enabled, but only filename/title/heading
metadata is sent and AI suggestions remain machine-extracted candidates.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import tempfile
import urllib.error
import urllib.request
import zipfile
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
TORT_DIR = ROOT / "data" / "legal_domain_packs" / "demo_maps" / "tort_law_hk"
DEFAULT_INVENTORY = TORT_DIR / "pi_form_inventory.json"
DEFAULT_FIELD_SCHEMAS = TORT_DIR / "pi_form_field_schemas.json"
DEFAULT_REPORT = TORT_DIR / "pi_form_ingestion_validation_report.json"

NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
MAX_HEADINGS = 12

ZIP_HINTS = {
    "quantum": "quantum_reference",
    "litigation": "litigation_procedure_reference",
    "principles": "principles_reference",
    "form": "form_bank",
}

FAMILY_BASE = {
    "accident_specific_particulars": {
        "required_facts": ["parties", "accident date", "accident location", "hazard/mechanism", "defendant control", "injury", "loss"],
        "principles": ["tort_law_hk.pi.negligence.application"],
        "procedures": ["pi_procedure.particulars_of_claim"],
        "substance_blocks": ["pi_common_parties_capacity", "pi_common_accident_core", "pi_common_liability_elements", "pi_common_injury_quantum", "pi_common_review_gate"],
    },
    "rta_particulars": {
        "required_facts": ["parties", "accident date", "road layout", "vehicle movement", "driver conduct", "police/insurance details", "injury", "loss"],
        "principles": ["tort_law_hk.pi.rta.router", "tort_law_hk.pi.rta.driver_duty"],
        "procedures": ["pi_procedure.particulars_of_claim", "pi_procedure.evidence_preservation"],
        "substance_blocks": ["pi_common_parties_capacity", "rta_scene_and_manoeuvre", "rta_driver_duty_breach", "pi_common_injury_quantum", "pi_common_review_gate"],
    },
    "workplace_particulars": {
        "required_facts": ["employment/work status", "work task", "workplace", "equipment/system", "training/supervision", "injury", "loss"],
        "principles": ["tort_law_hk.pi.employer.workplace_router", "tort_law_hk.pi.employer.safe_system"],
        "procedures": ["pi_procedure.particulars_of_claim", "pi_procedure.discovery", "pi_procedure.expert_evidence"],
        "substance_blocks": ["pi_common_parties_capacity", "workplace_status_and_task", "employer_primary_duty", "statutory_or_safety_system", "pi_common_injury_quantum", "pi_common_review_gate"],
    },
    "child_school_particulars": {
        "required_facts": ["child age/capacity", "school/occupier", "activity/equipment", "supervision", "risk assessment", "injury", "loss"],
        "principles": ["tort_law_hk.pi.occupiers.children_allurement", "tort_law_hk.pi.negligence.breach.risk_precautions"],
        "procedures": ["pi_procedure.particulars_of_claim", "pi_procedure.medical_evidence"],
        "substance_blocks": ["pi_common_parties_capacity", "pi_common_accident_core", "occupiers_or_general_duty", "breach_particulars", "pi_common_injury_quantum", "pi_common_review_gate"],
    },
    "psychiatric_particulars": {
        "required_facts": ["primary victim/event", "relationship", "proximity in time/place", "psychiatric diagnosis", "causation", "loss"],
        "principles": ["tort_law_hk.pi.psychiatric_injury.router", "tort_law_hk.pi.psychiatric_injury.secondary_victim"],
        "procedures": ["pi_procedure.medical_evidence", "pi_procedure.particulars_of_claim"],
        "substance_blocks": ["pi_common_parties_capacity", "pi_common_accident_core", "psychiatric_control_factors", "pi_common_injury_quantum", "pi_common_review_gate"],
    },
    "fatal_particulars": {
        "required_facts": ["deceased", "estate/representative capacity", "dependants", "accident facts", "liability basis", "dependency/estate losses"],
        "principles": ["tort_law_hk.pi.fatal_accident.router", "tort_law_hk.pi.fatal_accident.dependency"],
        "procedures": ["pi_procedure.statement_of_claim", "pi_procedure.statement_of_damages"],
        "substance_blocks": ["pi_common_parties_capacity", "pi_common_accident_core", "fatal_dependency_estate", "pi_common_review_gate"],
    },
    "defence": {
        "required_facts": ["admitted facts", "denied facts", "positive defences", "causation/quantum disputes", "documents/evidence"],
        "principles": ["tort_law_hk.pi.defences.router", "tort_law_hk.pi.negligence.causation_remoteness"],
        "procedures": ["pi_procedure.defence"],
        "substance_blocks": ["defence_admissions_denials", "positive_defences", "causation_and_quantum_denials", "proof_requirements", "pi_common_review_gate"],
    },
    "reply": {
        "required_facts": ["defence pleaded", "matters requiring reply", "limitation/disapplication facts", "counterclaim response"],
        "principles": ["tort_law_hk.pi.defences.router"],
        "procedures": ["pi_procedure.reply"],
        "substance_blocks": ["defence_admissions_denials", "positive_defences", "pi_common_review_gate"],
    },
    "summons_order": {
        "required_facts": ["application type", "order sought", "supporting evidence", "parties affected", "hearing/filing status"],
        "principles": ["tort_law_hk.pi.claim_router"],
        "procedures": ["pi_procedure.trial_preparation"],
        "substance_blocks": ["application_relief", "supporting_evidence", "draft_order_terms", "pi_common_review_gate"],
    },
    "evidence_expert": {
        "required_facts": ["expert/witness identity", "issue for evidence", "records requested", "deadline", "court direction sought"],
        "principles": ["tort_law_hk.pi.negligence.causation_remoteness", "tort_law_hk.pi.quantum.router"],
        "procedures": ["pi_procedure.expert_evidence"],
        "substance_blocks": ["medical_basis", "supporting_evidence", "pi_common_review_gate"],
    },
    "settlement_protected_party": {
        "required_facts": ["minor/protected party status", "settlement terms", "apportionment", "medical/quantum support", "approval basis"],
        "principles": ["tort_law_hk.pi.quantum.router"],
        "procedures": ["pi_procedure.settlement_offer"],
        "substance_blocks": ["pi_common_parties_capacity", "settlement_terms", "protected_party_approval", "pi_common_review_gate"],
    },
    "quantum_schedule": {
        "required_facts": ["diagnosis", "prognosis", "PSLA support", "special damages", "earnings loss", "future loss", "care/aids/housing", "interest"],
        "principles": ["tort_law_hk.pi.quantum.router", "tort_law_hk.pi.quantum.psla"],
        "procedures": ["pi_procedure.statement_of_damages"],
        "substance_blocks": ["medical_basis", "psla", "special_damages", "loss_of_earnings", "future_loss", "care_aids_housing", "pi_common_review_gate"],
    },
    "principles_reference": {
        "required_facts": ["source topic", "jurisdiction", "reviewer", "source-card status"],
        "principles": ["tort_law_hk.pi.claim_router"],
        "procedures": ["pi_procedure.intake"],
        "substance_blocks": ["pi_common_review_gate"],
    },
    "litigation_procedure_reference": {
        "required_facts": ["source topic", "procedure stage", "reviewer", "source-card status"],
        "principles": ["tort_law_hk.pi.claim_router"],
        "procedures": ["pi_procedure.intake"],
        "substance_blocks": ["pi_common_review_gate"],
    },
}

KEYWORD_TRIGGERS = {
    "staircase": ["staircase", "stairs", "fall"],
    "mall": ["mall", "common area", "building", "wet floor", "slip"],
    "private premises": ["private premises", "ticket", "visitor", "occupiers liability"],
    "playground": ["playground", "equipment", "child", "school"],
    "school supervision": ["school", "physical education", "supervision", "education authority"],
    "restaurant scald": ["restaurant", "scald", "hot water", "burn"],
    "dog bite": ["dog bite", "animal", "attack"],
    "falling object": ["falling canopy", "falling scaffold", "falling object", "scaffold"],
    "dangerous substances": ["dangerous substances", "chemical", "dermatitis", "deafness"],
    "electrocution": ["electrocution", "electric"],
    "unguarded machinery": ["unguarded machinery", "lifting appliance", "machinery"],
    "rta": ["road", "driver", "vehicle", "truck", "bus", "traffic", "crossing", "collision", "passenger", "motor", "highway", "u-turn", "zebra", "junction"],
    "defence": ["defence", "counterclaim", "contributory", "volenti", "seat belt", "latent defect", "independent contractor", "trespasser"],
    "settlement": ["infant settlement", "settlement", "apportionment", "minor", "protected party"],
    "quantum": ["quantum", "damages", "schedule", "loss", "dependency", "earnings"],
}

FORBIDDEN_OUTPUT_KEYS = {
    "full_text",
    "body_text",
    "paragraph_text",
    "document_text",
    "raw_text",
    "precedent_text",
    "clause_text",
}


@dataclass
class DocxItem:
    archive_name: str
    zip_member: str
    filename: str
    data: bytes
    source_category: str


def clean_title(name: str) -> str:
    stem = Path(name).stem
    stem = re.sub(r"^\d+\s+", "", stem)
    stem = stem.replace("_", " ").replace("  ", " ").strip()
    return stem[:180]


def slugify(value: str) -> str:
    value = value.lower().replace("&", " and ")
    value = re.sub(r"[^a-z0-9]+", "_", value)
    value = re.sub(r"_+", "_", value).strip("_")
    return value or "untitled"


def docx_xml(data: bytes, member: str) -> bytes | None:
    try:
        with zipfile.ZipFile(tempfile.NamedTemporaryFile(delete=False), "r"):
            pass
    except Exception:
        pass
    try:
        with tempfile.NamedTemporaryFile(delete=False) as tmp:
            tmp.write(data)
            tmp_path = tmp.name
        with zipfile.ZipFile(tmp_path) as zf:
            return zf.read(member)
    except Exception:
        return None
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


def extract_docx_structure(data: bytes) -> dict:
    xml_bytes = docx_xml(data, "word/document.xml")
    if not xml_bytes:
        return {"paragraph_count": 0, "table_count": 0, "heading_count": 0, "structural_headings": [], "placeholder_candidates": []}
    root = ET.fromstring(xml_bytes)
    paragraphs = root.findall(".//w:p", NS)
    tables = root.findall(".//w:tbl", NS)
    headings: list[str] = []
    for para in paragraphs:
        style = para.find(".//w:pStyle", NS)
        style_val = style.attrib.get(f"{{{NS['w']}}}val", "") if style is not None else ""
        text = "".join(t.text or "" for t in para.findall(".//w:t", NS)).strip()
        if text and ("heading" in style_val.lower() or style_val.lower() in {"title", "subtitle"}):
            headings.append(re.sub(r"\s+", " ", text)[:140])
    return {
        "paragraph_count": len(paragraphs),
        "table_count": len(tables),
        "heading_count": len(headings),
        "structural_headings": headings[:MAX_HEADINGS],
        "placeholder_candidates": [],
    }


def source_category_for(path: Path) -> str:
    low = path.name.lower()
    for key, val in ZIP_HINTS.items():
        if key in low:
            return val
    return "form_bank"


def iter_docx_inputs(paths: list[Path]) -> list[DocxItem]:
    items: list[DocxItem] = []
    for path in paths:
        if path.is_dir():
            category = source_category_for(path)
            for child in sorted(path.rglob("*.docx")):
                if child.name.startswith("~$"):
                    continue
                items.append(DocxItem(path.name, str(child.relative_to(path)), child.name, child.read_bytes(), category))
        elif path.suffix.lower() == ".zip":
            category = source_category_for(path)
            with zipfile.ZipFile(path) as zf:
                for info in sorted(zf.infolist(), key=lambda i: i.filename):
                    if info.is_dir() or not info.filename.lower().endswith(".docx") or Path(info.filename).name.startswith("~$"):
                        continue
                    items.append(DocxItem(path.name, info.filename, Path(info.filename).name, zf.read(info), category))
        elif path.suffix.lower() == ".docx":
            items.append(DocxItem(path.parent.name, path.name, path.name, path.read_bytes(), source_category_for(path)))
    return items


def classify_family(title: str, source_category: str) -> str:
    low = title.lower()
    if source_category in {"quantum_reference", "litigation_procedure_reference", "principles_reference"}:
        return source_category
    if "infant settlement" in low or "protected" in low:
        return "settlement_protected_party"
    if "reply" in low:
        return "reply"
    if "defence" in low:
        return "defence"
    if any(k in low for k in ["summons", "order", "undertaking", "letter of request", "examination of witness"]):
        return "summons_order"
    if "writ" in low:
        return "summons_order"
    if any(k in low for k in ["nervous shock", "psychiatric", "secondary victim", "aftermath"]):
        return "psychiatric_particulars"
    if any(k in low for k in ["widow", "widower", "fatal", "deceased", "dependency", "administratrices", "estate"]):
        return "fatal_particulars"
    if any(k in low for k in ["child", "school", "playground", "education", "supervision"]):
        return "child_school_particulars"
    if any(k in low for k in ["employee", "work", "scaffold", "construction", "dermatitis", "deafness", "electrocution", "machinery", "lifting appliance", "dangerous substances"]):
        return "workplace_particulars"
    if any(k in low for k in KEYWORD_TRIGGERS["rta"]):
        return "rta_particulars"
    if any(k in low for k in ["schedule", "quantum", "damages", "loss of earnings", "dependency"]):
        return "quantum_schedule"
    return "accident_specific_particulars"


def document_type_for(title: str, family: str) -> str:
    low = title.lower()
    if family.endswith("_reference"):
        return "reference_material"
    if "defence" in low:
        return "defence"
    if "reply" in low:
        return "reply"
    if "writ" in low:
        return "writ"
    if family == "summons_order":
        return "application_or_order"
    if family == "settlement_protected_party":
        return "settlement_approval"
    if family == "quantum_schedule":
        return "quantum_schedule"
    return "pleading"


def procedure_stage_for(document_type: str, family: str, title: str) -> str:
    low = title.lower()
    if family.endswith("_reference"):
        return "reference"
    if document_type in {"writ", "pleading"}:
        return "commencement"
    if document_type in {"defence", "reply"}:
        return "post_commencement"
    if document_type == "application_or_order":
        return "interlocutory_or_trial_preparation"
    if document_type == "settlement_approval":
        return "settlement"
    if document_type == "quantum_schedule":
        return "quantum"
    if "medical" in low or "expert" in low:
        return "evidence"
    return "intake"


def trigger_conditions(title: str, family: str) -> list[str]:
    low = title.lower()
    triggers = set(FAMILY_BASE.get(family, FAMILY_BASE["accident_specific_particulars"])["required_facts"][:0])
    for _, terms in KEYWORD_TRIGGERS.items():
        for term in terms:
            if term in low:
                triggers.add(term)
    if family.endswith("_reference"):
        triggers.update([family.replace("_", " "), "personal injury"])
    if not triggers:
        triggers.update([family.replace("_", " "), "personal injury"])
    return sorted(triggers)


def required_facts_for(title: str, family: str) -> list[str]:
    facts = list(FAMILY_BASE.get(family, FAMILY_BASE["accident_specific_particulars"])["required_facts"])
    low = title.lower()
    extras = []
    if "cctv" in low or "mall" in low or "premises" in low:
        extras += ["CCTV/incident report", "inspection or cleaning records"]
    if "seat belt" in low or "helmet" in low:
        extras += ["seatbelt/helmet use", "passenger conduct"]
    if "independent contractor" in low:
        extras += ["contractor identity", "contractor competence", "delegation/control facts"]
    if "limitation" in low:
        extras += ["accident date", "knowledge date", "disapplication facts"]
    if "mib" in low:
        extras += ["MIB involvement", "insurance status"]
    for item in extras:
        if item not in facts:
            facts.append(item)
    return facts


def linked_nodes_for(family: str) -> tuple[list[str], list[str]]:
    base = FAMILY_BASE.get(family, FAMILY_BASE["accident_specific_particulars"])
    return list(base["principles"]), list(base["procedures"])


def placeholders_from_facts(required_facts: list[str], extracted: list[str]) -> list[str]:
    fields = {slugify(f) for f in required_facts}
    fields.update(extracted)
    return sorted(fields)


def deepseek_suggest(metadata: dict, model: str) -> dict | None:
    key = os.getenv("DEEPSEEK_API_KEY", "").strip()
    if not key:
        return None
    prompt = {
        "instruction": "Classify this Hong Kong personal-injury form using only metadata. Do not invent legal authority. Return compact JSON with form_family, trigger_conditions, required_facts.",
        "metadata": metadata,
    }
    req = urllib.request.Request(
        "https://api.deepseek.com/chat/completions",
        data=json.dumps({
            "model": model,
            "messages": [
                {"role": "system", "content": "You classify legal form metadata. Never include precedent text."},
                {"role": "user", "content": json.dumps(prompt, ensure_ascii=False)},
            ],
            "temperature": 0,
            "response_format": {"type": "json_object"},
        }).encode("utf-8"),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        content = payload["choices"][0]["message"]["content"]
        return json.loads(content)
    except (urllib.error.URLError, KeyError, json.JSONDecodeError, TimeoutError) as exc:
        return {"error": str(exc)}


def inventory_record(item: DocxItem, use_deepseek: bool, model: str, index: int) -> tuple[dict, dict]:
    title = clean_title(item.filename)
    family = classify_family(title, item.source_category)
    doc_type = document_type_for(title, family)
    stage = procedure_stage_for(doc_type, family, title)
    structure = extract_docx_structure(item.data)
    source_hash = hashlib.sha256(item.data).hexdigest()
    form_id = f"pi_form_{index:03d}_{slugify(title)[:90]}"
    required = required_facts_for(title, family)
    principles, procedures = linked_nodes_for(family)
    placeholders = placeholders_from_facts(required, structure["placeholder_candidates"])
    base = FAMILY_BASE.get(family, FAMILY_BASE["accident_specific_particulars"])
    ai_suggestion = None
    if use_deepseek:
        ai_suggestion = deepseek_suggest({
            "filename": item.filename,
            "title": title,
            "source_category": item.source_category,
            "form_family": family,
            "structural_headings": structure["structural_headings"],
        }, model)
    record = {
        "form_id": form_id,
        "source_filename": item.filename,
        "source_archive": item.archive_name,
        "source_member": item.zip_member,
        "source_hash": source_hash,
        "title": title,
        "form_family": family,
        "document_type": doc_type,
        "procedural_stage": stage,
        "source_category": item.source_category,
        "source_status": "metadata_only_or_firm_private_template",
        "copyright_status": "metadata_only_no_full_text_reproduced",
        "trigger_conditions": trigger_conditions(title, family),
        "required_facts": required,
        "substance_blocks": base["substance_blocks"],
        "linked_principle_nodes": principles,
        "linked_procedure_nodes": procedures,
        "template_placeholders": placeholders,
        "structural_summary": {
            "paragraph_count": structure["paragraph_count"],
            "table_count": structure["table_count"],
            "heading_count": structure["heading_count"],
            "structural_headings": structure["structural_headings"],
        },
        "review_status": "machine_extracted_candidate",
        "output_mode": "draft_only_lawyer_review_required",
        "deepseek_assist": {
            "enabled": bool(use_deepseek),
            "model": model if use_deepseek else None,
            "status": "suggestion_recorded" if ai_suggestion and "error" not in ai_suggestion else ("error" if ai_suggestion else "not_used"),
            "suggestion": ai_suggestion,
        },
    }
    schema = {
        "form_id": form_id,
        "title": title,
        "source_hash": source_hash,
        "schema_status": "machine_extracted_candidate",
        "output_mode": "draft_only_lawyer_review_required",
        "fields": [
            {
                "field_id": name,
                "label": name.replace("_", " ").title(),
                "required": True,
                "source": "inferred_required_fact_or_placeholder",
                "review_status": "machine_extracted_candidate",
            }
            for name in placeholders
        ],
    }
    return record, schema


def validate_no_forbidden_keys(obj: object, path: str = "$") -> list[str]:
    errors: list[str] = []
    if isinstance(obj, dict):
        for key, value in obj.items():
            if key in FORBIDDEN_OUTPUT_KEYS:
                errors.append(f"{path}.{key} is forbidden for public metadata output")
            errors.extend(validate_no_forbidden_keys(value, f"{path}.{key}"))
    elif isinstance(obj, list):
        for idx, value in enumerate(obj):
            errors.extend(validate_no_forbidden_keys(value, f"{path}[{idx}]"))
    return errors


def build_report(inventory: dict, field_schemas: dict) -> dict:
    errors = []
    records = inventory["forms"]
    schemas = {s["form_id"]: s for s in field_schemas["field_schemas"]}
    for rec in records:
        for field in ["form_id", "title", "source_hash", "form_family", "required_facts", "linked_procedure_nodes", "review_status", "output_mode"]:
            if not rec.get(field):
                errors.append(f"{rec.get('form_id', rec.get('source_filename'))}: missing {field}")
        if len(rec.get("source_hash", "")) != 64:
            errors.append(f"{rec.get('form_id')}: source_hash is not SHA256")
        if rec.get("review_status") == "approved":
            errors.append(f"{rec.get('form_id')}: machine ingestion cannot mark approved")
        if rec.get("output_mode") != "draft_only_lawyer_review_required":
            errors.append(f"{rec.get('form_id')}: output_mode must stay draft_only_lawyer_review_required")
        if rec.get("copyright_status") != "metadata_only_no_full_text_reproduced":
            errors.append(f"{rec.get('form_id')}: copyright_status must be metadata_only_no_full_text_reproduced")
        if rec["form_id"] not in schemas:
            errors.append(f"{rec.get('form_id')}: missing field schema")
    errors.extend(validate_no_forbidden_keys(inventory))
    errors.extend(validate_no_forbidden_keys(field_schemas))
    counts = Counter(rec["form_family"] for rec in records)
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "status": "passed" if not errors else "failed",
        "form_count": len(records),
        "family_counts": dict(sorted(counts.items())),
        "errors": errors,
        "warnings": [
            "Machine-extracted metadata only; lawyer review required before drafting use.",
            "No full DOCX body text or precedent wording is emitted.",
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Ingest local PI DOCX/ZIP files into metadata-only JSON.")
    parser.add_argument("paths", nargs="+", type=Path, help="ZIP files, DOCX files, or folders to inventory")
    parser.add_argument("--inventory-out", type=Path, default=DEFAULT_INVENTORY)
    parser.add_argument("--field-schemas-out", type=Path, default=DEFAULT_FIELD_SCHEMAS)
    parser.add_argument("--report-out", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--use-deepseek", action="store_true", help="Optionally request metadata-only classification suggestions from DeepSeek")
    parser.add_argument("--deepseek-model", default=os.getenv("DEEPSEEK_MODEL", "deepseek-chat"))
    args = parser.parse_args()

    items = iter_docx_inputs(args.paths)
    records = []
    schemas = []
    for idx, item in enumerate(items, start=1):
        record, schema = inventory_record(item, args.use_deepseek, args.deepseek_model, idx)
        records.append(record)
        schemas.append(schema)

    inventory = {
        "domain_id": "tort_law_hk",
        "inventory_id": "pi_form_inventory",
        "title": "PI Form Inventory - Metadata Only",
        "version": "0.1.0",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "copyright_policy": "metadata_and_field_schema_only_no_proprietary_form_text",
        "review_status": "machine_extracted_candidate",
        "output_mode": "draft_only_lawyer_review_required",
        "forms": records,
    }
    field_schemas = {
        "domain_id": "tort_law_hk",
        "schema_id": "pi_form_field_schemas",
        "title": "PI Form Field Schemas - Machine Candidates",
        "version": "0.1.0",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "copyright_policy": "field_names_only_no_precedent_text",
        "field_schemas": schemas,
    }
    report = build_report(inventory, field_schemas)

    for path, payload in [(args.inventory_out, inventory), (args.field_schemas_out, field_schemas), (args.report_out, report)]:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"Ingested {len(records)} DOCX files")
    print(f"Validation status: {report['status']}")
    if report["errors"]:
        for error in report["errors"]:
            print(f"- {error}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
