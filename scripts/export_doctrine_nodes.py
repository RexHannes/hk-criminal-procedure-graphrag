#!/usr/bin/env python3
"""Export stable doctrine nodes from static domain packs.

This is the bridge from the viewer ontology to a future Casemap4/Supabase
evidence backend. It does not promote any node to an answer-safe status.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = REPO_ROOT / "data" / "legal_domain_packs" / "demo_maps"
INDEX_PATH = REPO_ROOT / "data" / "index.json"


def load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def domain_dirs(selected: list[str] | None = None) -> list[tuple[str, Path]]:
    registry = load_json(INDEX_PATH)
    wanted = set(selected or [])
    domains = []
    for item in registry.get("domains", []):
        domain_id = item.get("domain_id")
        if wanted and domain_id not in wanted:
            continue
        domains.append((domain_id, DATA_ROOT / item["path"].replace("/domain.json", "")))
    return domains


def collect_domain(domain_id: str, domain_dir: Path) -> tuple[list[dict], list[str]]:
    errors: list[str] = []
    manifest = load_json(domain_dir / "consolidated.json")

    raw_nodes: dict[str, dict] = {}
    parent_by_id: dict[str, str | None] = {}
    section_by_id: dict[str, dict] = {}
    children_by_parent: dict[str, list[str]] = {}

    for section in manifest.get("sections", []):
        nodes = load_json(domain_dir / section["node_file"]).get("nodes", [])
        edges = load_json(domain_dir / section["edge_file"]).get("edges", [])
        for node in nodes:
            node_id = node.get("id")
            if not node_id:
                errors.append(f"{domain_id}: node missing id in {section['node_file']}")
                continue
            if node_id in raw_nodes:
                errors.append(f"{domain_id}: duplicate node id {node_id}")
            raw_nodes[node_id] = node
            section_by_id[node_id] = section
        for edge in edges:
            if edge.get("relationship") == "has_subtopic":
                parent_by_id[edge.get("to")] = edge.get("from")
                children_by_parent.setdefault(edge.get("from"), []).append(edge.get("to"))

    exported: list[dict] = []
    seen_doctrine_ids: set[str] = set()
    for node_id, node in raw_nodes.items():
        doctrine_id = node.get("doctrine_node_id") or f"{domain_id}.{node_id}"
        if doctrine_id in seen_doctrine_ids:
            errors.append(f"{domain_id}: duplicate doctrine_node_id {doctrine_id}")
        seen_doctrine_ids.add(doctrine_id)

        parent_node_id = parent_by_id.get(node_id)
        parent_doctrine_id = None
        if parent_node_id:
            parent = raw_nodes.get(parent_node_id)
            if not parent:
                errors.append(f"{domain_id}: missing parent node {parent_node_id}")
            else:
                parent_doctrine_id = parent.get("doctrine_node_id") or f"{domain_id}.{parent_node_id}"

        section = section_by_id.get(node_id, {})
        exported.append(
            {
                "doctrine_node_id": doctrine_id,
                "source_node_id": node_id,
                "parent_doctrine_node_id": parent_doctrine_id,
                "domain_id": domain_id,
                "title": node.get("label", node_id),
                "node_type": node.get("type", "unknown"),
                "area_of_law": domain_id,
                "topic": section.get("title"),
                "issue": node.get("subtopic") or node.get("label"),
                "section": node.get("section"),
                "path": build_path(node_id, raw_nodes, parent_by_id, domain_id),
                "summary": node.get("summary", ""),
                "verification_status": node.get("verification_status", "needs_hklii_verification"),
                "answer_layer_status": node.get("answer_layer_status", "not_product_answer_layer"),
                "authority_status": node.get("authority_status", "unverified_case_seed"),
                "human_review_status": node.get("human_review_status", "unreviewed"),
                "case_seed_count": len(node.get("case_seeds", [])),
                "statute_ref_count": len(node.get("statute_refs", [])),
                "child_count": len(children_by_parent.get(node_id, [])),
            }
        )

    return exported, errors


def build_path(
    node_id: str, raw_nodes: dict[str, dict], parent_by_id: dict[str, str | None], domain_id: str
) -> list[str]:
    path = []
    current = node_id
    guard = 0
    while current and guard < 64:
        node = raw_nodes.get(current)
        path.append(node.get("label", current) if node else current)
        current = parent_by_id.get(current)
        guard += 1
    path.append(domain_id)
    return list(reversed(path))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--domain", action="append", help="Limit export to one domain_id. Repeatable.")
    parser.add_argument(
        "--output",
        default="artifacts/doctrine_nodes/doctrine_nodes.json",
        help="Output JSON path. Use '-' for stdout.",
    )
    parser.add_argument("--dry-run", action="store_true", help="Validate and print coverage without writing.")
    args = parser.parse_args()

    all_nodes: list[dict] = []
    all_errors: list[str] = []
    coverage: dict[str, int] = {}
    for domain_id, domain_dir in domain_dirs(args.domain):
        nodes, errors = collect_domain(domain_id, domain_dir)
        all_nodes.extend(nodes)
        all_errors.extend(errors)
        coverage[domain_id] = len(nodes)

    result = {"doctrine_nodes": all_nodes, "coverage": coverage, "errors": all_errors}

    if all_errors:
        for error in all_errors:
            print(f"ERROR: {error}")
        return 1

    if args.dry_run:
        print(json.dumps({"coverage": coverage, "total": len(all_nodes)}, indent=2))
        return 0

    if args.output == "-":
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0

    output = REPO_ROOT / args.output
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {len(all_nodes)} doctrine nodes to {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
