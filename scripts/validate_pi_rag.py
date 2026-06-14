#!/usr/bin/env python3
"""Validate the public-safe PI RAG index."""

from __future__ import annotations

import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "data" / "legal_domain_packs" / "demo_maps" / "tort_law_hk" / "pi_rag_index.json"
FORBIDDEN = {"full_text", "body_text", "paragraph_text", "document_text", "raw_text", "precedent_text", "clause_text", "wording"}


def walk(obj, path="$"):
    errors = []
    if isinstance(obj, dict):
        for key, value in obj.items():
            if key in FORBIDDEN:
                errors.append(f"{path}.{key} is forbidden")
            errors.extend(walk(value, f"{path}.{key}"))
    elif isinstance(obj, list):
        for i, value in enumerate(obj):
            errors.extend(walk(value, f"{path}[{i}]"))
    return errors


def main() -> int:
    index = json.loads(INDEX.read_text(encoding="utf-8"))
    errors = []
    chunks = index.get("chunks", [])
    if not chunks:
        errors.append("No chunks in PI RAG index.")
    layers = {c.get("layer") for c in chunks}
    for expected in {"principles", "procedures_forms", "governance"}:
        if expected not in layers:
            errors.append(f"Missing layer: {expected}")
    policy = index.get("retrieval_policy", {})
    if "legislation" not in policy.get("source_hierarchy", []):
        errors.append("Retrieval policy missing source_hierarchy with legislation first.")
    if policy.get("governance_layer") != "governance":
        errors.append("Retrieval policy missing governance_layer=governance.")
    for chunk in chunks:
        for field in ["chunk_id", "layer", "title", "source_file", "citation", "pinpoint", "quote", "tokens"]:
            if not chunk.get(field):
                errors.append(f"{chunk.get('chunk_id', '<unknown>')}: missing {field}")
        if chunk.get("answer_layer_status") == "answer_safe":
            errors.append(f"{chunk.get('chunk_id')}: RAG MVP must not index answer_safe chunks")
        if chunk.get("output_mode") not in {"draft_only_lawyer_review_required", "internal_only", "blocked_until_review"}:
            errors.append(f"{chunk.get('chunk_id')}: unsafe output_mode {chunk.get('output_mode')}")
    errors.extend(walk(index))
    if errors:
        print("PI RAG validation failed:")
        for err in errors:
            print(f"- {err}")
        return 1
    print(f"PI RAG validation passed: {len(chunks)} chunks across {len(layers)} layers.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
