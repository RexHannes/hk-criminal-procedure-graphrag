#!/usr/bin/env python3
"""Validate the demo HK personal-injury source-card workflow.

This is a deterministic guardrail for the Phase 1 PI cockpit. It enforces the
fail-closed contract: no displayed legal/procedural node, form, or draft
paragraph can quietly float free of a source card or firm-private clause.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "pi_ontology"
FIRM = ROOT / "data" / "firm_overlay" / "pi_demo_firm_overlay.json"


def load(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def require(condition: bool, message: str, errors: list[str]) -> None:
    if not condition:
        errors.append(message)


def main() -> int:
    errors: list[str] = []

    nodes_doc = load(DATA / "pi_nodes.json")
    edges_doc = load(DATA / "pi_edges.json")
    flows_doc = load(DATA / "pi_flows.json")
    forms_doc = load(DATA / "pi_form_registry.json")
    cards_doc = load(DATA / "pi_demo_source_cards.json")
    firm_doc = load(FIRM)

    nodes = {n["node_id"]: n for n in [*nodes_doc.get("legal_nodes", []), *nodes_doc.get("procedural_nodes", [])]}
    legal_ids = {n["node_id"] for n in nodes_doc.get("legal_nodes", [])}
    cards = {c["source_card_id"]: c for c in cards_doc.get("source_cards", [])}
    forms = {f["form_id"]: f for f in forms_doc.get("forms", [])}
    firm_clause_ids = {
        block["block_id"]
        for sop in firm_doc.get("sops", [])
        for block in sop.get("blocks", [])
    }

    require(bool(nodes), "No PI nodes found.", errors)
    require(bool(cards), "No PI source cards found.", errors)

    for card_id, card in cards.items():
        for field in ("proposition_id", "topic", "source_type", "source_title", "citation", "pinpoint", "jurisdiction", "verification_status", "answer_layer_status"):
            require(bool(card.get(field)), f"Source card {card_id} missing {field}.", errors)
        require(bool(card.get("quoted_excerpt") or card.get("supporting_quote")), f"Source card {card_id} missing quote/excerpt.", errors)
        require(card.get("jurisdiction") in {"Hong Kong", "Hong Kong SAR"}, f"Source card {card_id} has non-HK jurisdiction.", errors)
        if card.get("verification_status") in {"verified", "source_verified"}:
            require(bool(card.get("reviewed_by")), f"Verified/source-verified card {card_id} lacks reviewed_by.", errors)
        if card.get("answer_layer_status") == "answer_safe":
            require(card.get("verification_status") == "verified", f"Answer-safe card {card_id} is not verification_status=verified.", errors)

    for node_id, node in nodes.items():
        node_cards = node.get("source_card_ids", [])
        source_missing = node.get("verification_status") == "source_missing" or node_id == "pi_source_missing"
        require(bool(node_cards) or source_missing, f"Node {node_id} has no source_card_ids and is not marked source_missing.", errors)
        for card_id in node_cards:
            require(card_id in cards, f"Node {node_id} references missing source card {card_id}.", errors)
        for form_id in node.get("related_forms", []):
            require(form_id in forms, f"Node {node_id} references missing form {form_id}.", errors)
        if node.get("answer_layer_status") == "answer_safe":
            require(all(cards[cid].get("verification_status") == "verified" for cid in node_cards if cid in cards), f"Node {node_id} is answer_safe without all verified cards.", errors)

    for edge in edges_doc.get("edges", []):
        require(edge.get("from") in nodes, f"Edge from missing node {edge.get('from')}.", errors)
        require(edge.get("to") in nodes, f"Edge to missing node {edge.get('to')}.", errors)
        require(bool(edge.get("relationship")), f"Edge {edge.get('from')} -> {edge.get('to')} missing relationship.", errors)

    for flow in flows_doc.get("flows", []):
        for section in flow.get("sections", []):
            for node_id in section.get("nodes", []):
                require(node_id in nodes, f"Flow {flow.get('flow_id')} section {section.get('section_id')} references missing node {node_id}.", errors)

    for form_id, form in forms.items():
        for field in ("title", "document_type", "jurisdiction", "procedural_stage", "source_status", "verification_status", "output_mode"):
            require(bool(form.get(field)), f"Form {form_id} missing {field}.", errors)
        require(bool(form.get("required_facts")), f"Form {form_id} missing required_facts.", errors)
        require(bool(form.get("trigger_conditions")), f"Form {form_id} missing trigger_conditions.", errors)
        for node_id in form.get("linked_legal_nodes", []):
            require(node_id in legal_ids, f"Form {form_id} references missing/non-legal node {node_id}.", errors)
        for node_id in form.get("linked_procedural_steps", []):
            require(node_id in nodes, f"Form {form_id} references missing procedural step {node_id}.", errors)
        for card_id in form.get("source_card_ids", []):
            require(card_id in cards, f"Form {form_id} references missing source card {card_id}.", errors)
        if "official_form" in form.get("source_status", ""):
            require(form.get("verification_status") == "needs_latest_form_check", f"Official-form metadata {form_id} must require latest form check.", errors)

    for preview in flows_doc.get("document_previews", []):
        require(preview.get("form_id") in forms, f"Preview {preview.get('preview_id')} references missing form {preview.get('form_id')}.", errors)
        for para in preview.get("paragraphs", []):
            trail = [*para.get("source_card_ids", []), *para.get("firm_template_clause_ids", [])]
            require(bool(trail), f"Preview paragraph {para.get('paragraph_id')} lacks source card or firm clause trail.", errors)
            for card_id in para.get("source_card_ids", []):
                require(card_id in cards, f"Preview paragraph {para.get('paragraph_id')} references missing source card {card_id}.", errors)
            for clause_id in para.get("firm_template_clause_ids", []):
                require(clause_id in firm_clause_ids, f"Preview paragraph {para.get('paragraph_id')} references missing firm clause {clause_id}.", errors)

    restricted = [
        c["source_card_id"]
        for c in cards.values()
        if c.get("source_license_status") in {"copyrighted_unlicensed", "metadata_only"} and c.get("answer_layer_status") == "answer_safe"
    ]
    require(not restricted, "Copyright/licence restricted cards cannot be answer_safe: " + ", ".join(restricted), errors)

    if errors:
        print("PI workflow validation failed:")
        for err in errors:
            print(f"- {err}")
        return 1

    print(
        "PI workflow validation passed: "
        f"{len(legal_ids)} legal nodes, "
        f"{len(nodes) - len(legal_ids)} procedural nodes, "
        f"{len(cards)} source cards, "
        f"{len(forms)} forms."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
