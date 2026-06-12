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
SUPPORT_NODE_TYPES = {"case_seed", "statute", "practice_direction", "source_anchor"}
QUERY_EXPANSIONS = [
    (
        re.compile(
            r"\b(hit|crash|crashed|collision|collided|knocked|struck|accident|injur(?:y|ed|ies))\b.*\b(car|vehicle|taxi|bus|lorry|truck|driver|road|traffic|motor)\b"
            r"|\b(car|vehicle|taxi|bus|lorry|truck|driver|road|traffic|motor)\b.*\b(hit|crash|crashed|collision|collided|knocked|struck|accident|injur(?:y|ed|ies))\b",
            re.I,
        ),
        "negligence duty of care breach causation damage personal injury road user driver traffic accident",
        {"tort_law_hk"},
    ),
    (
        re.compile(
            r"\b(work|worker|employee|employer|workplace|site)\b.*\b(injur(?:y|ed|ies)|accident|unsafe|fall|fell)\b"
            r"|\b(injur(?:y|ed|ies)|accident|unsafe|fall|fell)\b.*\b(work|worker|employee|employer|workplace|site)\b",
            re.I,
        ),
        "employer duty vicarious liability safe system of work personal injury negligence breach",
        {"tort_law_hk"},
    ),
    (
        re.compile(
            r"\b(slip|slipped|trip|tripped|fall|fell)\b.*\b(shop|mall|premises|building|restaurant|office|stairs|floor)\b"
            r"|\b(shop|mall|premises|building|restaurant|office|stairs|floor)\b.*\b(slip|slipped|trip|tripped|fall|fell)\b",
            re.I,
        ),
        "occupiers liability premises negligence duty of care breach personal injury",
        {"tort_law_hk"},
    ),
]


def tokens(text: str) -> set[str]:
    return {t for t in re.findall(r"[a-z0-9]+", (text or "").lower()) if len(t) > 2}


def expand_query(query: str) -> tuple[str, set[str]]:
    expanded = [query]
    preferred_domains: set[str] = set()
    for pattern, extra, domains in QUERY_EXPANSIONS:
        if pattern.search(query):
            expanded.append(extra)
            preferred_domains.update(domains)
    return " ".join(expanded), preferred_domains


def load_doctrine_nodes() -> list[dict]:
    nodes = []
    for domain_id, domain_dir in domain_dirs():
        domain_nodes, errors = collect_domain(domain_id, domain_dir)
        if errors:
            raise ValueError("; ".join(errors))
        nodes.extend(domain_nodes)
    return nodes


def score_node(query_tokens: set[str], preferred_domains: set[str], node: dict) -> int:
    title = node.get("title", "") or ""
    node_id = node.get("doctrine_node_id", "") or ""
    haystack = " ".join(
        [
            node_id,
            node.get("title", ""),
            node.get("topic", "") or "",
            node.get("issue", "") or "",
            node.get("summary", ""),
        ]
    )
    haystack_tokens = tokens(haystack)
    title_tokens = tokens(title)
    id_tokens = tokens(node_id)
    score = 0
    for token in query_tokens:
        if token in haystack_tokens:
            score += 1
        if token in title_tokens:
            score += 3
        if token in id_tokens:
            score += 2
    if preferred_domains:
        if node.get("domain_id") in preferred_domains:
            score += 2
        else:
            score -= 4
    return score


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
    expanded_query, preferred_domains = expand_query(query)
    query_tokens = tokens(expanded_query)

    searchable_nodes = [
        node for node in doctrine_nodes
        if node.get("node_type") != "section_header" and node.get("node_type") not in SUPPORT_NODE_TYPES
    ]
    scored = [(score_node(query_tokens, preferred_domains, node), node) for node in searchable_nodes]
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
