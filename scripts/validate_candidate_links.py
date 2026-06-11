#!/usr/bin/env python3
"""Validate machine-candidate links from Casemap4 propositions to doctrine nodes.

DeepSeek or any other LLM may propose links, but this validator is the
gatekeeper. Accepted records remain review material only:
``verification_status=machine_candidate`` and
``answer_layer_status=not_answer_safe``.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
import json
from pathlib import Path
import re
from typing import Any


ALLOWED_LINK_TYPES = {
    "leading_authority",
    "applied_authority",
    "illustrative",
    "contrary",
    "caution",
    "factual_application",
    "statutory_interpretation",
}

DOCTRINAL_ANCHORS = {
    "burden",
    "cap ",
    "cap.",
    "element",
    "elements",
    "exception",
    "ground",
    "grounds",
    "must",
    "principle",
    "principles",
    "reasonable grounds",
    "requires",
    "section",
    "shall",
    "statutory",
    "test",
}

NODE_ID_RE = re.compile(r"^[a-z0-9_]+$")


@dataclass(slots=True)
class AuthorityLookup:
    cases: dict[str, dict[str, Any]]
    paragraphs: dict[str, dict[str, Any]]
    propositions: dict[str, dict[str, Any]]


def read_json(path: str | Path) -> Any:
    with Path(path).expanduser().open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: str | Path, payload: Any) -> None:
    output_path = Path(path).expanduser()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip()).lower()


def tokenize(text: str) -> set[str]:
    return {token for token in re.findall(r"[a-z0-9][a-z0-9'-]{2,}", (text or "").lower())}


def load_doctrine_nodes(nodes_root: str | Path) -> dict[str, dict[str, Any]]:
    root = Path(nodes_root).expanduser()
    nodes: dict[str, dict[str, Any]] = {}
    pending_parent_refs: list[tuple[str, str]] = []
    for path in sorted(root.rglob("*.json")):
        payload = read_json(path)
        for node in payload.get("nodes", []):
            node_id = str(node.get("id") or "").strip()
            if not node_id:
                raise ValueError(f"node missing id in {path}")
            if not NODE_ID_RE.match(node_id):
                raise ValueError(f"invalid doctrine node id format: {node_id}")
            if not str(node.get("label") or "").strip():
                raise ValueError(f"node {node_id} missing label")
            if node_id in nodes:
                raise ValueError(f"duplicate doctrine node id: {node_id}")
            parent_node_id = str(node.get("parent_node_id") or "").strip()
            if parent_node_id:
                pending_parent_refs.append((node_id, parent_node_id))
            nodes[node_id] = node
    for node_id, parent_node_id in pending_parent_refs:
        if parent_node_id not in nodes:
            raise ValueError(f"node {node_id} references missing parent_node_id: {parent_node_id}")
    return nodes


def load_authority_lookup(authority_index: str | Path) -> AuthorityLookup:
    payload = read_json(authority_index)
    return AuthorityLookup(
        cases={str(item.get("id") or ""): item for item in payload.get("cases", []) if item.get("id")},
        paragraphs={str(item.get("id") or ""): item for item in payload.get("paragraphs", []) if item.get("id")},
        propositions={str(item.get("id") or ""): item for item in payload.get("propositions", []) if item.get("id")},
    )


def paragraph_text_for_proposition(proposition: dict[str, Any], paragraphs: dict[str, dict[str, Any]]) -> str:
    supporting_ids = [str(pid) for pid in proposition.get("supporting_paragraph_ids", []) if str(pid)]
    return " ".join(str(paragraphs.get(pid, {}).get("text") or "") for pid in supporting_ids)


def quote_is_supported(quote: str, source_text: str) -> bool:
    if not quote.strip():
        return True
    normalized_quote = normalize_text(quote)
    normalized_source = normalize_text(source_text)
    if normalized_quote and normalized_quote in normalized_source:
        return True
    quote_tokens = tokenize(quote)
    source_tokens = tokenize(source_text)
    if not quote_tokens:
        return False
    return len(quote_tokens & source_tokens) / max(len(quote_tokens), 1) >= 0.9


def has_doctrinal_anchor(text: str) -> bool:
    normalized = normalize_text(text)
    return any(anchor in normalized for anchor in DOCTRINAL_ANCHORS)


def _candidate_tries_to_certify(candidate: dict[str, Any]) -> bool:
    return candidate.get("verification_status") != "machine_candidate" or candidate.get("answer_layer_status") != "not_answer_safe"


def validate_candidate(
    candidate: dict[str, Any],
    *,
    doctrine_nodes: dict[str, dict[str, Any]],
    authority: AuthorityLookup,
) -> tuple[dict[str, Any] | None, list[str]]:
    errors: list[str] = []
    proposition_id = str(candidate.get("proposition_id") or "").strip()
    doctrine_node_id = str(candidate.get("candidate_doctrine_node_id") or "").strip()
    link_type = str(candidate.get("link_type") or "").strip()

    if not proposition_id:
        errors.append("missing_proposition_id")
    if proposition_id and proposition_id not in authority.propositions:
        errors.append(f"unknown_proposition_id:{proposition_id}")
    if not doctrine_node_id:
        errors.append("missing_candidate_doctrine_node_id")
    if doctrine_node_id and doctrine_node_id not in doctrine_nodes:
        errors.append(f"unknown_doctrine_node_id:{doctrine_node_id}")
    if link_type not in ALLOWED_LINK_TYPES:
        errors.append(f"invalid_link_type:{link_type or '<empty>'}")

    try:
        confidence = float(candidate.get("confidence"))
    except (TypeError, ValueError):
        confidence = -1.0
    if confidence < 0.0 or confidence > 1.0:
        errors.append("confidence_out_of_range")

    if _candidate_tries_to_certify(candidate):
        errors.append("candidate_may_not_be_answer_safe_or_verified")

    proposition = authority.propositions.get(proposition_id, {})
    paragraph_ids = [str(pid) for pid in proposition.get("supporting_paragraph_ids", []) if str(pid)]
    if proposition_id and not paragraph_ids:
        errors.append("proposition_missing_supporting_paragraph")
    missing_paragraphs = [pid for pid in paragraph_ids if pid not in authority.paragraphs]
    if missing_paragraphs:
        errors.append(f"missing_source_paragraph:{','.join(missing_paragraphs)}")

    source_text = paragraph_text_for_proposition(proposition, authority.paragraphs)
    supporting_quote = str(candidate.get("supporting_quote") or "")
    if supporting_quote and not quote_is_supported(supporting_quote, source_text):
        errors.append("supporting_quote_not_found_in_source_paragraph")

    proposition_text = str(proposition.get("proposition_text") or "")
    reason = str(candidate.get("reason") or "")
    if link_type in {"leading_authority", "statutory_interpretation"} and not has_doctrinal_anchor(
        f"{proposition_text} {source_text} {reason}"
    ):
        errors.append("legal_test_link_lacks_doctrinal_anchor")

    supplied_case_id = str(candidate.get("case_id") or "").strip()
    if supplied_case_id and supplied_case_id != str(proposition.get("case_id") or ""):
        errors.append("candidate_case_id_does_not_match_proposition")

    if errors:
        return None, errors

    accepted = {
        "proposition_id": proposition_id,
        "candidate_doctrine_node_id": doctrine_node_id,
        "link_type": link_type,
        "confidence": confidence,
        "supporting_quote": supporting_quote,
        "reason": reason,
        "verification_status": "machine_candidate",
        "answer_layer_status": "not_answer_safe",
        "risks": list(candidate.get("risks") or []),
    }
    return accepted, []


def validate_candidates(
    candidates: list[dict[str, Any]],
    *,
    doctrine_nodes: dict[str, dict[str, Any]],
    authority: AuthorityLookup,
) -> dict[str, Any]:
    accepted: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []
    for candidate in candidates:
        accepted_candidate, errors = validate_candidate(candidate, doctrine_nodes=doctrine_nodes, authority=authority)
        if accepted_candidate:
            accepted.append(accepted_candidate)
        else:
            rejected.append({"candidate": candidate, "errors": errors})
    return {
        "schema_version": "candidate-evidence-v1",
        "accepted_count": len(accepted),
        "rejected_count": len(rejected),
        "accepted": accepted,
        "rejected": rejected,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate proposition-to-doctrine candidate links.")
    parser.add_argument("--authority-index", required=True)
    parser.add_argument("--nodes-root", required=True)
    parser.add_argument("--candidates", required=True)
    parser.add_argument("--report-output", default="")
    args = parser.parse_args()

    doctrine_nodes = load_doctrine_nodes(args.nodes_root)
    authority = load_authority_lookup(args.authority_index)
    payload = read_json(args.candidates)
    candidates = payload.get("candidates", payload if isinstance(payload, list) else [])
    report = validate_candidates(candidates, doctrine_nodes=doctrine_nodes, authority=authority)

    if args.report_output:
        write_json(args.report_output, report)
    print(json.dumps({k: report[k] for k in ("schema_version", "accepted_count", "rejected_count")}, indent=2))
    return 1 if report["rejected_count"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
