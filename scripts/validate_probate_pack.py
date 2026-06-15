#!/usr/bin/env python3
"""Validate the metadata-only Hong Kong Probate domain pack."""

from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PROBATE_DIR = ROOT / "data" / "legal_domain_packs" / "demo_maps" / "probate_law_hk"


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    errors: list[str] = []
    manifest = load(PROBATE_DIR / "consolidated.json")
    principles = load(PROBATE_DIR / "nodes" / "01_probate_principles.json")["nodes"]
    procedures = load(PROBATE_DIR / "nodes" / "02_probate_procedures.json")["nodes"]
    forms = load(PROBATE_DIR / "probate_form_registry.json")["forms"]
    flows = load(PROBATE_DIR / "probate_procedure_flows.json")["flows"]
    contracts = load(PROBATE_DIR / "probate_answer_contracts.json")["answer_contracts"]
    rag = load(PROBATE_DIR / "probate_rag_index.json")

    node_ids = {node["id"] for node in principles + procedures}
    doctrine_ids = {node["doctrine_node_id"] for node in principles + procedures}
    form_ids = [form["form_id"] for form in forms]
    form_id_set = set(form_ids)

    if manifest["domain_id"] != "probate_law_hk":
        errors.append("manifest domain_id is not probate_law_hk")
    if len(principles) < 60:
        errors.append(f"expected at least 60 principle nodes, got {len(principles)}")
    if len(procedures) < 20:
        errors.append(f"expected at least 20 procedure nodes, got {len(procedures)}")
    if len(forms) < 100:
        errors.append(f"expected at least 100 form metadata records, got {len(forms)}")
    if len(flows) < 5:
        errors.append(f"expected at least 5 Probate flows, got {len(flows)}")
    if len(contracts) < 4:
        errors.append(f"expected at least 4 answer contracts, got {len(contracts)}")
    dup_forms = [form_id for form_id, count in Counter(form_ids).items() if count > 1]
    if dup_forms:
        errors.append(f"duplicate form_ids: {dup_forms[:5]}")

    for section in manifest["sections"]:
        node_file = PROBATE_DIR / section["node_file"]
        edge_file = PROBATE_DIR / section["edge_file"]
        if not node_file.exists():
            errors.append(f"missing node file {node_file}")
        if not edge_file.exists():
            errors.append(f"missing edge file {edge_file}")
        for edge in load(edge_file).get("edges", []):
            if edge["from"] not in node_ids:
                errors.append(f"edge from missing node: {edge}")
            if edge["to"] not in node_ids:
                errors.append(f"edge to missing node: {edge}")

    for node in principles + procedures:
        if node.get("answer_layer_status") != "not_product_answer_layer":
            errors.append(f"{node['id']} is not marked not_product_answer_layer")
        if node.get("verification_status") not in {"needs_source_card_verification"}:
            errors.append(f"{node['id']} has unexpected verification_status {node.get('verification_status')}")
        for doctrine_id in node.get("linked_principle_nodes", []):
            if doctrine_id not in doctrine_ids:
                errors.append(f"{node['id']} links missing principle {doctrine_id}")
        for form_id in node.get("linked_forms", []):
            if form_id not in form_id_set:
                errors.append(f"{node['id']} links missing form {form_id}")

    for form in forms:
        if form.get("output_mode") != "draft_only_lawyer_review_required":
            errors.append(f"{form['form_id']} is not draft-only")
        if form.get("copyright_status") != "metadata_only_no_full_text_reproduced":
            errors.append(f"{form['form_id']} has unsafe copyright_status")
        if not form.get("required_facts"):
            errors.append(f"{form['form_id']} missing required_facts")
        if "precedent_text" in form or "body_text" in form:
            errors.append(f"{form['form_id']} appears to expose body text")

    if rag.get("safety", {}).get("raw_book_text_committed") is not False:
        errors.append("rag safety raw_book_text_committed must be false")
    if rag.get("safety", {}).get("raw_form_text_committed") is not False:
        errors.append("rag safety raw_form_text_committed must be false")
    if rag.get("safety", {}).get("answer_safe_cards") != 0:
        errors.append("rag index must not contain answer-safe cards")

    index = load(ROOT / "data" / "index.json")
    if not any(domain.get("domain_id") == "probate_law_hk" for domain in index.get("domains", [])):
        errors.append("probate_law_hk not registered in data/index.json")

    if errors:
        print("Probate pack validation failed:")
        for error in errors:
            print(f"- {error}")
        return 1
    print(
        "Probate pack validation passed: "
        f"{len(principles)} principle nodes, {len(procedures)} procedure nodes, "
        f"{len(forms)} forms, {len(flows)} flows, {len(rag.get('chunks', []))} RAG chunks."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
