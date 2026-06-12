#!/usr/bin/env python3
"""Validate paragraph-grounded evidence linked to doctrine nodes.

The validator is intentionally deterministic. DeepSeek or another LLM may
propose candidates, but this script rejects unsafe promotion and unsupported
quotes before anything can be used by a search/answer layer.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
SAFE_STATUSES = {"source_verified", "human_reviewed", "answer_safe"}
LLM_ALLOWED_STATUSES = {"machine_candidate", "quote_candidate"}
ALL_ALLOWED_STATUSES = LLM_ALLOWED_STATUSES | {"quote_verified", "paragraph_verified"} | SAFE_STATUSES
UNSAFE_ANSWER_LAYER_STATUSES = {"answer_safe", "product_answer_layer"}


def load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def load_doctrine_ids(doctrine_nodes_path: Path | None) -> set[str]:
    if doctrine_nodes_path and doctrine_nodes_path.exists():
        data = load_json(doctrine_nodes_path)
        return {n["doctrine_node_id"] for n in data.get("doctrine_nodes", [])}

    from export_doctrine_nodes import collect_domain, domain_dirs

    ids: set[str] = set()
    errors: list[str] = []
    for domain_id, domain_dir in domain_dirs():
        nodes, domain_errors = collect_domain(domain_id, domain_dir)
        ids.update(n["doctrine_node_id"] for n in nodes)
        errors.extend(domain_errors)
    if errors:
        raise ValueError("; ".join(errors))
    return ids


def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def paragraph_lookup(evidence: dict) -> dict[tuple[str, str], dict]:
    lookup = {}
    for para in evidence.get("legal_paragraphs", []):
        case_id = para.get("case_id")
        para_no = str(para.get("para_no", ""))
        if case_id and para_no:
            lookup[(case_id, para_no)] = para
    return lookup


def case_ids(evidence: dict) -> set[str]:
    return {case.get("case_id") for case in evidence.get("legal_cases", []) if case.get("case_id")}


def validate_evidence(evidence: dict, doctrine_ids: set[str]) -> tuple[list[dict], list[dict]]:
    paragraphs = paragraph_lookup(evidence)
    cases = case_ids(evidence)
    valid: list[dict] = []
    rejected: list[dict] = []

    proposition_by_id = {
        p.get("proposition_id"): p for p in evidence.get("proposition_cards", []) if p.get("proposition_id")
    }

    for link in evidence.get("proposition_doctrine_links", []):
        reasons: list[str] = []
        proposition_id = link.get("proposition_id")
        proposition = proposition_by_id.get(proposition_id)
        if not proposition:
            reasons.append("unknown_proposition_id")
        doctrine_id = link.get("doctrine_node_id")
        if doctrine_id not in doctrine_ids:
            reasons.append("unknown_doctrine_node_id")
        status = link.get("verification_status", "machine_candidate")
        if status not in ALL_ALLOWED_STATUSES:
            reasons.append("unknown_verification_status")
        if status in SAFE_STATUSES and link.get("human_review_status") != "human_reviewed":
            reasons.append("safe_status_requires_human_review")
        if link.get("answer_layer_status") in UNSAFE_ANSWER_LAYER_STATUSES:
            reasons.append("link_attempts_answer_safe_promotion")

        if proposition:
            case_id = proposition.get("case_id")
            if case_id not in cases:
                reasons.append("unknown_case_id")
            para_span = [str(p) for p in proposition.get("paragraph_span", [])]
            if not para_span:
                reasons.append("missing_paragraph_span")
            paragraph_text = " ".join(normalize(paragraphs.get((case_id, p), {}).get("text", "")) for p in para_span)
            if any((case_id, p) not in paragraphs for p in para_span):
                reasons.append("paragraph_not_found")
            quote = normalize(proposition.get("supporting_quote", ""))
            if quote and quote not in paragraph_text:
                reasons.append("supporting_quote_not_found")
            if proposition.get("answer_layer_status") in UNSAFE_ANSWER_LAYER_STATUSES:
                reasons.append("proposition_attempts_answer_safe_promotion")
            if proposition.get("paragraph_role") == "factual_application" and link.get("link_type") == "legal_test":
                reasons.append("factual_application_mislabelled_as_legal_test")

        if reasons:
            rejected.append({"link": link, "reasons": reasons})
        else:
            valid.append(link)

    return valid, rejected


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--evidence", required=True, help="Evidence JSON file to validate.")
    parser.add_argument(
        "--doctrine-nodes",
        help="Optional doctrine node export from scripts/export_doctrine_nodes.py.",
    )
    parser.add_argument("--output", help="Optional validated/rejected report path.")
    args = parser.parse_args()

    evidence = load_json(REPO_ROOT / args.evidence)
    doctrine_ids = load_doctrine_ids(REPO_ROOT / args.doctrine_nodes if args.doctrine_nodes else None)
    valid, rejected = validate_evidence(evidence, doctrine_ids)
    report = {"valid_count": len(valid), "rejected_count": len(rejected), "valid_links": valid, "rejected": rejected}

    if args.output:
        output = REPO_ROOT / args.output
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"valid_count": len(valid), "rejected_count": len(rejected)}, indent=2))
    return 1 if rejected else 0


if __name__ == "__main__":
    raise SystemExit(main())
