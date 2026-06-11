#!/usr/bin/env python3
"""Deterministic doctrine/evidence search prototype.

This is not an AI answer engine. It returns the API response shape needed by a
future LLM/Supabase bridge while abstaining when evidence is not verified.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from export_doctrine_nodes import collect_domain, domain_dirs
from validate_evidence_links import SAFE_STATUSES, load_json, validate_evidence


REPO_ROOT = Path(__file__).resolve().parents[1]


def tokens(text: str) -> set[str]:
    return {t for t in re.findall(r"[a-z0-9]+", (text or "").lower()) if len(t) > 2}


def load_doctrine_nodes() -> list[dict]:
    nodes = []
    for domain_id, domain_dir in domain_dirs():
        domain_nodes, errors = collect_domain(domain_id, domain_dir)
        if errors:
            raise ValueError("; ".join(errors))
        nodes.extend(domain_nodes)
    return nodes


def score_node(query_tokens: set[str], node: dict) -> int:
    haystack = " ".join(
        [
            node.get("doctrine_node_id", ""),
            node.get("title", ""),
            node.get("topic", "") or "",
            node.get("issue", "") or "",
            node.get("summary", ""),
        ]
    )
    return len(query_tokens & tokens(haystack))


def build_evidence_maps(evidence: dict) -> tuple[dict, dict, dict]:
    cases = {case["case_id"]: case for case in evidence.get("legal_cases", []) if case.get("case_id")}
    paragraphs = {}
    for para in evidence.get("legal_paragraphs", []):
        paragraphs[(para.get("case_id"), str(para.get("para_no")))] = para
    propositions = {
        prop["proposition_id"]: prop for prop in evidence.get("proposition_cards", []) if prop.get("proposition_id")
    }
    return cases, paragraphs, propositions


def answer_query(query: str, evidence: dict | None = None, max_nodes: int = 6) -> dict:
    doctrine_nodes = load_doctrine_nodes()
    doctrine_ids = {node["doctrine_node_id"] for node in doctrine_nodes}
    query_tokens = tokens(query)

    scored = [(score_node(query_tokens, node), node) for node in doctrine_nodes]
    matched = [node for score, node in sorted(scored, key=lambda item: item[0], reverse=True) if score > 0][:max_nodes]
    detected_domains = sorted({node["domain_id"] for node in matched})

    warnings = []
    retrieved = []
    citations = []
    trace = [{"step": "detected_domains", "value": detected_domains}]

    if evidence:
        valid_links, rejected = validate_evidence(evidence, doctrine_ids)
        if rejected:
            warnings.append("some_candidate_evidence_rejected")
        cases, paragraphs, propositions = build_evidence_maps(evidence)
        matched_ids = {node["doctrine_node_id"] for node in matched}
        for link in valid_links:
            if link.get("doctrine_node_id") not in matched_ids:
                continue
            prop = propositions.get(link["proposition_id"])
            if not prop:
                continue
            case = cases.get(prop.get("case_id"), {})
            para_span = [str(p) for p in prop.get("paragraph_span", [])]
            para_refs = [paragraphs.get((prop.get("case_id"), p), {}) for p in para_span]
            item = {
                "doctrine_node_id": link.get("doctrine_node_id"),
                "proposition_id": prop.get("proposition_id"),
                "proposition": prop.get("candidate_proposition"),
                "case_name": case.get("case_name"),
                "citation": case.get("neutral_citation"),
                "court_level": case.get("court_level"),
                "paragraph_span": para_span,
                "supporting_quote": prop.get("supporting_quote"),
                "source_url": case.get("source_url") or (para_refs[0].get("source_url") if para_refs else None),
                "verification_status": link.get("verification_status"),
                "authority_role": link.get("authority_role") or link.get("link_type"),
            }
            retrieved.append(item)
            if item["citation"]:
                citations.append(item["citation"])

    if not retrieved:
        warnings.append("no_verified_paragraph_proof")
        answer_confidence = "low"
    elif any(item["verification_status"] in SAFE_STATUSES for item in retrieved):
        answer_confidence = "high"
    else:
        warnings.append("candidate_only")
        answer_confidence = "low"

    if not any(item.get("verification_status") in SAFE_STATUSES for item in retrieved):
        warnings.append("insufficient_authority")

    trace.extend(
        [
            {"step": "matched_doctrine_nodes", "value": [n["doctrine_node_id"] for n in matched]},
            {"step": "retrieved_propositions", "value": [r["proposition_id"] for r in retrieved]},
            {"step": "warnings", "value": warnings},
        ]
    )

    return {
        "query": query,
        "detected_domains": detected_domains,
        "matched_doctrine_nodes": matched,
        "retrieved_propositions": retrieved,
        "citations": sorted(set(citations)),
        "warnings": sorted(set(warnings)),
        "answer_confidence": answer_confidence,
        "evidence_trace": trace,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("query")
    parser.add_argument("--evidence", help="Optional evidence JSON file.")
    parser.add_argument("--max-nodes", type=int, default=6)
    args = parser.parse_args()

    evidence = load_json(REPO_ROOT / args.evidence) if args.evidence else None
    print(json.dumps(answer_query(args.query, evidence, args.max_nodes), indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
