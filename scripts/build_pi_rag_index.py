#!/usr/bin/env python3
"""Build a metadata-only PI retrieval index.

This is an MVP RAG index for the source-gated PI workflow. It indexes public-safe
metadata from the Tort/PI graph and form registries; it does not index DOCX body
text or proprietary precedent wording.
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TORT_DIR = ROOT / "data" / "legal_domain_packs" / "demo_maps" / "tort_law_hk"
OUT = TORT_DIR / "pi_rag_index.json"


def load(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def tokenize(text: str) -> list[str]:
    return [t for t in re.split(r"[^a-z0-9]+", text.lower()) if len(t) >= 2]


def compact_list(items, limit=12):
    return [str(x) for x in (items or [])[:limit]]


def chunk_text(parts: list[str]) -> str:
    return " | ".join(p for p in parts if p)


def source_quote(title: str, required_facts=None, triggers=None) -> str:
    bits = [title]
    if triggers:
      bits.append("Triggers: " + ", ".join(compact_list(triggers, 8)))
    if required_facts:
      bits.append("Required facts: " + ", ".join(compact_list(required_facts, 8)))
    return " | ".join(bits)


def add_chunk(chunks: list[dict], *, chunk_id: str, layer: str, title: str, source_file: str, citation: str, quote: str, text: str, metadata: dict):
    tokens = tokenize(text + " " + quote + " " + title)
    chunks.append({
        "chunk_id": chunk_id,
        "layer": layer,
        "title": title,
        "source_file": source_file,
        "citation": citation,
        "pinpoint": metadata.get("pinpoint") or metadata.get("id") or metadata.get("form_id") or metadata.get("family_id") or chunk_id,
        "quote": quote[:500],
        "text": text[:2000],
        "tokens": dict(Counter(tokens)),
        "token_count": len(tokens),
        "metadata": metadata,
        "answer_layer_status": metadata.get("answer_layer_status", "not_product_answer_layer"),
        "review_status": metadata.get("review_status") or metadata.get("human_review_status") or "machine_extracted_candidate",
        "output_mode": metadata.get("output_mode", "draft_only_lawyer_review_required"),
    })


def main() -> int:
    chunks: list[dict] = []

    principles = load(TORT_DIR / "nodes" / "11_personal_injury_principles.json")
    procedures = load(TORT_DIR / "nodes" / "12_personal_injury_procedures.json")
    core_forms = load(TORT_DIR / "pi_form_registry.json")
    expanded_forms = load(TORT_DIR / "pi_form_registry_expanded.json")
    substance = load(TORT_DIR / "pi_form_substance_map.json")
    inventory = load(TORT_DIR / "pi_form_inventory.json")
    field_schemas = load(TORT_DIR / "pi_form_field_schemas.json")

    for node in principles.get("nodes", []):
        add_chunk(
            chunks,
            chunk_id="principle:" + node["id"],
            layer="principles",
            title=node.get("label", node["id"]),
            source_file="nodes/11_personal_injury_principles.json",
            citation=node.get("doctrine_node_id", node["id"]),
            quote=source_quote(node.get("label", ""), node.get("required_facts"), node.get("search_terms")),
            text=chunk_text([
                node.get("summary", ""),
                " ".join(node.get("required_facts", [])),
                " ".join(node.get("search_terms", [])),
                " ".join(node.get("linked_existing_tort_nodes", [])),
                " ".join(node.get("linked_procedure_nodes", [])),
            ]),
            metadata={**node, "pinpoint": node.get("subsection") or node.get("id")},
        )

    for node in procedures.get("nodes", []):
        add_chunk(
            chunks,
            chunk_id="procedure:" + node["id"],
            layer="procedures_forms",
            title=node.get("label", node["id"]),
            source_file="nodes/12_personal_injury_procedures.json",
            citation=node.get("doctrine_node_id", node["id"]),
            quote=source_quote(node.get("label", ""), node.get("required_facts"), node.get("trigger_conditions")),
            text=chunk_text([
                node.get("summary", ""),
                " ".join(node.get("trigger_conditions", [])),
                " ".join(node.get("required_facts", [])),
                " ".join(node.get("linked_principle_nodes", [])),
                " ".join(node.get("linked_forms", [])),
            ]),
            metadata={**node, "pinpoint": node.get("subsection") or node.get("id")},
        )

    for source_name, registry in [("pi_form_registry.json", core_forms), ("pi_form_registry_expanded.json", expanded_forms)]:
        for form in registry.get("forms", []):
            add_chunk(
                chunks,
                chunk_id=f"form_registry:{form['form_id']}",
                layer="procedures_forms",
                title=form.get("title", form["form_id"]),
                source_file=source_name,
                citation=form["form_id"],
                quote=source_quote(form.get("title", ""), form.get("required_facts"), form.get("trigger_conditions")),
                text=chunk_text([
                    form.get("title", ""),
                    form.get("form_family", ""),
                    form.get("document_type", ""),
                    form.get("procedural_stage", ""),
                    " ".join(form.get("trigger_conditions", [])),
                    " ".join(form.get("required_facts", [])),
                    " ".join(form.get("substance_fields", [])),
                    " ".join(form.get("linked_principle_nodes", [])),
                    " ".join(form.get("linked_procedure_nodes", [])),
                ]),
                metadata=form,
            )

    for block in substance.get("common_substance_blocks", []):
        add_chunk(
            chunks,
            chunk_id="substance:" + block["block_id"],
            layer="procedures_forms",
            title=block.get("label", block["block_id"]),
            source_file="pi_form_substance_map.json",
            citation=block["block_id"],
            quote=source_quote(block.get("label", ""), block.get("required_facts")),
            text=chunk_text([block.get("label", ""), " ".join(block.get("required_facts", [])), " ".join(block.get("linked_principle_nodes", []))]),
            metadata=block,
        )
    for family in substance.get("form_family_substance", []):
        add_chunk(
            chunks,
            chunk_id="substance_family:" + family["family_id"],
            layer="procedures_forms",
            title=family.get("label", family["family_id"]),
            source_file="pi_form_substance_map.json",
            citation=family["family_id"],
            quote=source_quote(family.get("label", ""), family.get("substance_order"), family.get("applies_to_forms")),
            text=chunk_text([
                family.get("label", ""),
                " ".join(family.get("applies_to_forms", [])),
                " ".join(family.get("substance_order", [])),
                " ".join(block.get("label", "") for block in family.get("specific_blocks", [])),
            ]),
            metadata=family,
        )

    schema_by_id = {s["form_id"]: s for s in field_schemas.get("field_schemas", [])}
    for form in inventory.get("forms", []):
        schema = schema_by_id.get(form["form_id"], {})
        fields = [f["field_id"] for f in schema.get("fields", [])]
        add_chunk(
            chunks,
            chunk_id="form_inventory:" + form["form_id"],
            layer="procedures_forms",
            title=form.get("title", form["form_id"]),
            source_file="pi_form_inventory.json",
            citation=form["form_id"],
            quote=source_quote(form.get("title", ""), form.get("required_facts"), form.get("trigger_conditions")),
            text=chunk_text([
                form.get("title", ""),
                form.get("source_filename", ""),
                form.get("form_family", ""),
                form.get("document_type", ""),
                form.get("procedural_stage", ""),
                " ".join(form.get("trigger_conditions", [])),
                " ".join(form.get("required_facts", [])),
                " ".join(fields),
                " ".join(form.get("linked_principle_nodes", [])),
                " ".join(form.get("linked_procedure_nodes", [])),
            ]),
            metadata={
                "form_id": form["form_id"],
                "source_filename": form.get("source_filename"),
                "source_archive": form.get("source_archive"),
                "source_hash": form.get("source_hash"),
                "form_family": form.get("form_family"),
                "document_type": form.get("document_type"),
                "procedural_stage": form.get("procedural_stage"),
                "trigger_conditions": form.get("trigger_conditions"),
                "required_facts": form.get("required_facts"),
                "linked_principle_nodes": form.get("linked_principle_nodes"),
                "linked_procedure_nodes": form.get("linked_procedure_nodes"),
                "template_placeholders": form.get("template_placeholders"),
                "review_status": form.get("review_status"),
                "output_mode": form.get("output_mode"),
                "copyright_status": form.get("copyright_status"),
            },
        )

    index = {
        "index_id": "pi_rag_index",
        "domain_id": "tort_law_hk",
        "version": "0.1.0",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "retrieval_policy": {
            "no_source_no_answer": True,
            "metadata_only": True,
            "no_proprietary_form_text": True,
            "answer_sections": ["principles", "procedures_forms"],
            "minimum_score_default": 2.0,
            "review_gate": "draft_only_lawyer_review_required"
        },
        "chunks": chunks,
    }
    OUT.write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Built PI RAG index with {len(chunks)} chunks: {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
