"""DOCX form parser v1: emits metadata and field candidates only."""

from __future__ import annotations

import hashlib
import re
import zipfile
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET


NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}


def slugify(value: str) -> str:
    value = value.lower().replace("&", " and ")
    value = re.sub(r"[^a-z0-9]+", "_", value)
    return re.sub(r"_+", "_", value).strip("_") or "untitled"


def docx_structure(path: Path) -> dict[str, Any]:
    """Return structural metadata only; never emit paragraph/full text."""

    data = path.read_bytes()
    paragraph_count = 0
    table_count = 0
    heading_candidates: list[str] = []
    placeholder_candidates: list[str] = []
    try:
        with zipfile.ZipFile(path) as zf:
            xml = zf.read("word/document.xml")
        root = ET.fromstring(xml)
        paragraphs = root.findall(".//w:p", NS)
        tables = root.findall(".//w:tbl", NS)
        paragraph_count = len(paragraphs)
        table_count = len(tables)
        for para in paragraphs:
            text = "".join(t.text or "" for t in para.findall(".//w:t", NS)).strip()
            if not text:
                continue
            style = para.find(".//w:pStyle", NS)
            style_val = style.attrib.get(f"{{{NS['w']}}}val", "") if style is not None else ""
            if "heading" in style_val.lower() or len(text) <= 80 and text.isupper():
                heading_candidates.append(text[:120])
            for token in re.findall(r"\[[A-Z0-9_ /-]{2,}\]|\{\{[a-zA-Z0-9_ .-]+\}\}", text):
                placeholder_candidates.append(slugify(token))
    except Exception:
        pass
    return {
        "source_hash": hashlib.sha256(data).hexdigest(),
        "paragraph_count": paragraph_count,
        "table_count": table_count,
        "heading_count": len(heading_candidates),
        "heading_labels": heading_candidates[:12],
        "template_placeholders": sorted(set(placeholder_candidates))[:40],
    }


def form_metadata_from_docx(path: Path, *, form_family: str = "unclassified_form") -> dict[str, Any]:
    structure = docx_structure(path)
    form_id = f"form_{slugify(path.stem)}"
    return {
        "form_id": form_id,
        "title": path.stem.replace("_", " ")[:180],
        "form_family": form_family,
        "document_type": "metadata_only_form",
        "source_filename": path.name,
        "source_hash": structure["source_hash"],
        "source_status": "metadata_only_or_firm_private_template",
        "copyright_status": "metadata_only_no_full_text_reproduced",
        "trigger_conditions": [form_family],
        "required_facts": ["parties", "procedural stage", "relief sought", "lawyer review"],
        "linked_issues": [],
        "linked_procedure_steps": ["legal_procedure.review_required"],
        "field_schema": [
            {"field_id": field_id, "label": field_id.replace("_", " ").title(), "required": False, "source": "machine_candidate"}
            for field_id in structure["template_placeholders"]
        ],
        "review_status": "machine_extracted_candidate",
        "output_mode": "draft_only_lawyer_review_required",
        "structure": structure,
    }

