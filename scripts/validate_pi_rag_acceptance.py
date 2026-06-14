#!/usr/bin/env python3
"""Acceptance checks for the PI source-gated RAG MVP."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
QUERY = ROOT / "scripts" / "query_pi_rag.py"


TESTS = [
    {
        "id": "no_source_no_answer",
        "query": "blue whale admiralty taxation treaty",
        "expect_abstain": True,
        "must_contain": ["cannot verify", "source_missing_lawyer_review_required"],
    },
    {
        "id": "limitation_warning",
        "query": "What is the limitation period for a HK personal injury claim?",
        "must_contain": ["limitation", "accident date", "date of knowledge", "disability", "minor"],
    },
    {
        "id": "form_draft_requires_template",
        "query": "Draft a District Court writ for my PI case.",
        "must_contain": ["dc_writ_form_1", "plaintiff", "defendant", "indorsement", "current jurisdiction"],
    },
    {
        "id": "workplace_overlay",
        "query": "I was injured at work. What forms are needed?",
        "must_contain": ["eco_form_2", "eco_form_2a", "eco_form_2b", "common-law", "employee compensation"],
    },
    {
        "id": "court_band",
        "query": "My claim is about HK$2.5m. Which court?",
        "must_contain": ["District Court", "HK$75,000", "HK$3 million", "verify current jurisdiction"],
    },
    {
        "id": "pd18_1_sop",
        "query": "What are the key PI procedural steps? letter before action writ statement of claim statement of damages defence expert reports checklist review CMC PTR",
        "must_contain": ["pd18_1_annex_a", "writ", "statement of claim", "statement", "checklist", "pre-trial review"],
    },
    {
        "id": "precedent_not_authority",
        "query": "Use my old statement of claim precedent to tell me the legal test.",
        "must_contain": ["precedent", "not authority", "authority_vs_precedent"],
    },
]


def run_query(query: str) -> dict:
    proc = subprocess.run(
        [sys.executable, str(QUERY), query, "--limit", "16"],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if proc.returncode not in {0, 2}:
        raise RuntimeError(proc.stderr or proc.stdout)
    return json.loads(proc.stdout)


def blob(payload: dict) -> str:
    return json.dumps(payload, ensure_ascii=False).lower()


def main() -> int:
    errors: list[str] = []
    for test in TESTS:
        payload = run_query(test["query"])
        text = blob(payload)
        if test.get("expect_abstain") is not None and payload.get("abstain") is not test["expect_abstain"]:
            errors.append(f"{test['id']}: expected abstain={test['expect_abstain']} got {payload.get('abstain')}")
        for expected in test.get("must_contain", []):
            if expected.lower() not in text:
                errors.append(f"{test['id']}: missing {expected!r}")
    if errors:
        print("PI RAG acceptance validation failed:")
        for error in errors:
            print(f"- {error}")
        return 1
    print(f"PI RAG acceptance validation passed: {len(TESTS)} scenarios.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
