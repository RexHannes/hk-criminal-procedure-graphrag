#!/usr/bin/env python3
"""Generate machine-candidate doctrine links for Casemap4 propositions.

DeepSeek is optional and candidate-only. This script never writes verified or
answer-safe links. All output should be passed through validate_candidate_links.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import sys
from typing import Any
from urllib import request as urllib_request

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from validate_candidate_links import (  # noqa: E402
    AuthorityLookup,
    load_authority_lookup,
    load_doctrine_nodes,
    paragraph_text_for_proposition,
    tokenize,
    validate_candidates,
    write_json,
)


DEFAULT_MODEL = "deepseek-chat"
DEFAULT_API_URL = "https://api.deepseek.com/chat/completions"


def compact(text: str, limit: int = 1400) -> str:
    cleaned = re.sub(r"\s+", " ", (text or "")).strip()
    return cleaned[:limit]


def doctrine_text(node: dict[str, Any]) -> str:
    fields = [
        node.get("id"),
        node.get("label"),
        node.get("summary"),
        " ".join(node.get("statute_refs", []) or []),
        " ".join(node.get("case_seeds", []) or []),
    ]
    return " ".join(str(item or "") for item in fields)


def rank_nodes_for_proposition(
    proposition: dict[str, Any],
    paragraph_text: str,
    doctrine_nodes: dict[str, dict[str, Any]],
    *,
    top_n: int = 8,
) -> list[dict[str, Any]]:
    prop_blob = f"{proposition.get('proposition_text', '')} {paragraph_text}"
    prop_tokens = tokenize(prop_blob)
    ranked: list[tuple[float, dict[str, Any]]] = []
    for node in doctrine_nodes.values():
        if node.get("type") not in {"legal_issue", "statute", "practice_direction", "restricted_nsl"}:
            continue
        node_tokens = tokenize(doctrine_text(node))
        if not node_tokens:
            continue
        overlap = prop_tokens & node_tokens
        score = len(overlap) / max(len(node_tokens), 1)
        if node.get("type") == "legal_issue":
            score += 0.05
        if score > 0:
            ranked.append((score, node))
    ranked.sort(key=lambda item: item[0], reverse=True)
    return [node for _score, node in ranked[:top_n]]


def heuristic_candidate(
    proposition: dict[str, Any],
    paragraph_text: str,
    ranked_nodes: list[dict[str, Any]],
) -> dict[str, Any] | None:
    if not ranked_nodes:
        return None
    proposition_text = compact(str(proposition.get("proposition_text") or ""), 500)
    return {
        "proposition_id": proposition.get("id"),
        "candidate_doctrine_node_id": ranked_nodes[0].get("id"),
        "link_type": "illustrative",
        "confidence": 0.35,
        "supporting_quote": proposition_text,
        "reason": "Deterministic lexical overlap candidate generated without LLM certification.",
        "verification_status": "machine_candidate",
        "answer_layer_status": "not_answer_safe",
        "risks": ["heuristic_only", "requires_human_review"],
    }


def deepseek_payload(
    proposition: dict[str, Any],
    paragraph_text: str,
    case: dict[str, Any] | None,
    ranked_nodes: list[dict[str, Any]],
    model: str,
) -> dict[str, Any]:
    node_options = [
        {
            "id": node.get("id"),
            "label": node.get("label"),
            "summary": compact(str(node.get("summary") or ""), 600),
        }
        for node in ranked_nodes
    ]
    system_prompt = (
        "You propose candidate legal doctrine links only. Do not certify authority. "
        "Return strict JSON only. You must choose one candidate_doctrine_node_id from the supplied options. "
        "Do not invent cases, paragraphs, statutes, citations, or doctrine node IDs."
    )
    user_payload = {
        "doctrine_node_options": node_options,
        "case_metadata": case or {},
        "proposition": {
            "id": proposition.get("id"),
            "text": proposition.get("proposition_text"),
            "type": proposition.get("proposition_type"),
            "supporting_paragraph_ids": proposition.get("supporting_paragraph_ids", []),
        },
        "source_paragraph_text": compact(paragraph_text, 2200),
        "required_output_shape": {
            "proposition_id": proposition.get("id"),
            "candidate_doctrine_node_id": "one supplied option id",
            "link_type": "leading_authority | applied_authority | illustrative | contrary | caution | factual_application | statutory_interpretation",
            "confidence": "number from 0 to 1",
            "supporting_quote": "exact quote from source_paragraph_text only",
            "reason": "short explanation",
            "verification_status": "machine_candidate",
            "answer_layer_status": "not_answer_safe",
            "risks": [],
        },
    }
    return {
        "model": model,
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)},
        ],
    }


def call_deepseek(payload: dict[str, Any], *, api_key: str, api_url: str) -> dict[str, Any]:
    req = urllib_request.Request(
        api_url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )
    with urllib_request.urlopen(req, timeout=90) as response:
        raw = json.loads(response.read().decode("utf-8"))
    content = raw["choices"][0]["message"]["content"]
    return json.loads(content)


def candidate_output_paths(output: str, output_dir: str) -> dict[str, Path]:
    if output_dir:
        root = Path(output_dir).expanduser()
    else:
        root = Path(output).expanduser().parent
    return {
        "combined": Path(output).expanduser(),
        "raw": root / "raw_candidates.json",
        "validated": root / "validated_candidates.json",
        "rejected": root / "rejected_candidates.json",
    }


def generate_candidates(
    *,
    doctrine_nodes: dict[str, dict[str, Any]],
    authority: AuthorityLookup,
    max_propositions: int,
    no_llm: bool,
    dry_run: bool,
    model: str,
    api_url: str,
) -> list[dict[str, Any]]:
    api_key = os.environ.get("DEEPSEEK_API_KEY", "").strip()
    use_llm = bool(api_key) and not no_llm and not dry_run
    candidates: list[dict[str, Any]] = []
    propositions = list(authority.propositions.values())[: max(0, max_propositions)]

    for proposition in propositions:
        paragraph_text = paragraph_text_for_proposition(proposition, authority.paragraphs)
        if not paragraph_text:
            continue
        ranked_nodes = rank_nodes_for_proposition(proposition, paragraph_text, doctrine_nodes)
        if not ranked_nodes:
            continue
        candidate: dict[str, Any] | None
        if use_llm:
            case = authority.cases.get(str(proposition.get("case_id") or ""))
            payload = deepseek_payload(proposition, paragraph_text, case, ranked_nodes, model)
            candidate = call_deepseek(payload, api_key=api_key, api_url=api_url)
        else:
            candidate = heuristic_candidate(proposition, paragraph_text, ranked_nodes)
        if candidate:
            candidates.append(candidate)
    return candidates


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate candidate doctrine links for Casemap4 propositions.")
    parser.add_argument("--authority-index", required=True)
    parser.add_argument("--nodes-root", required=True)
    parser.add_argument(
        "--output",
        default="artifacts/candidate_evidence/proposition_node_candidates.json",
        help="Backward-compatible combined output path",
    )
    parser.add_argument(
        "--output-dir",
        default="",
        help="Directory for raw_candidates.json, validated_candidates.json, and rejected_candidates.json",
    )
    parser.add_argument("--max-propositions", type=int, default=200)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--api-url", default=DEFAULT_API_URL)
    parser.add_argument("--no-llm", action="store_true", help="Disable DeepSeek even if DEEPSEEK_API_KEY is set")
    parser.add_argument("--dry-run", action="store_true", help="Generate deterministic machine candidates without DeepSeek")
    parser.add_argument("--no-write", action="store_true", help="Print summary without writing candidate output")
    args = parser.parse_args()

    doctrine_nodes = load_doctrine_nodes(args.nodes_root)
    authority = load_authority_lookup(args.authority_index)
    raw_candidates = generate_candidates(
        doctrine_nodes=doctrine_nodes,
        authority=authority,
        max_propositions=args.max_propositions,
        no_llm=args.no_llm,
        dry_run=args.dry_run,
        model=args.model,
        api_url=args.api_url,
    )
    report = validate_candidates(raw_candidates, doctrine_nodes=doctrine_nodes, authority=authority)
    output = {
        "schema_version": "candidate-evidence-v1",
        "generation_mode": "deepseek" if os.environ.get("DEEPSEEK_API_KEY") and not args.no_llm and not args.dry_run else "dry_run_heuristic",
        "authority_index": str(Path(args.authority_index).expanduser()),
        "nodes_root": str(Path(args.nodes_root).expanduser()),
        "raw_candidate_count": len(raw_candidates),
        "accepted_count": report["accepted_count"],
        "rejected_count": report["rejected_count"],
        "candidates": report["accepted"],
        "rejected": report["rejected"],
    }
    if not args.no_write:
        paths = candidate_output_paths(args.output, args.output_dir)
        write_json(
            paths["raw"],
            {
                "schema_version": "candidate-evidence-v1",
                "generation_mode": output["generation_mode"],
                "authority_index": output["authority_index"],
                "nodes_root": output["nodes_root"],
                "raw_candidate_count": len(raw_candidates),
                "candidates": raw_candidates,
            },
        )
        write_json(
            paths["validated"],
            {
                "schema_version": "candidate-evidence-v1",
                "accepted_count": report["accepted_count"],
                "candidates": report["accepted"],
            },
        )
        write_json(
            paths["rejected"],
            {
                "schema_version": "candidate-evidence-v1",
                "rejected_count": report["rejected_count"],
                "rejected": report["rejected"],
            },
        )
        write_json(paths["combined"], output)
    print(json.dumps({k: output[k] for k in ("schema_version", "generation_mode", "accepted_count", "rejected_count")}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
