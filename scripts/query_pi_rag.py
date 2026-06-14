#!/usr/bin/env python3
"""Query the PI metadata RAG index with fail-closed source gating."""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "data" / "legal_domain_packs" / "demo_maps" / "tort_law_hk" / "pi_rag_index.json"


def tokenize(text: str) -> list[str]:
    return [t for t in re.split(r"[^a-z0-9]+", text.lower()) if len(t) >= 2]


def score_chunk(query_terms: list[str], chunk: dict) -> float:
    counts = chunk.get("tokens", {})
    score = 0.0
    for term in query_terms:
        if term in counts:
            score += 1.0 + math.log1p(counts[term])
    phrase = " ".join(query_terms)
    if phrase and phrase in (chunk.get("text", "") + " " + chunk.get("quote", "")).lower():
        score += 2.0
    return score


def retrieve(index: dict, query: str, limit: int, min_score: float) -> list[dict]:
    terms = tokenize(query)
    scored = []
    for chunk in index.get("chunks", []):
        score = score_chunk(terms, chunk)
        if score >= min_score:
            scored.append({**chunk, "score": round(score, 3)})
    scored.sort(key=lambda c: (-c["score"], c["layer"], c["title"]))
    return scored[:limit]


def grouped(chunks: list[dict]) -> dict[str, list[dict]]:
    return {
        "principles": [c for c in chunks if c.get("layer") == "principles"],
        "procedures_forms": [c for c in chunks if c.get("layer") == "procedures_forms"],
    }


def build_fail_closed_answer(query: str, chunks: list[dict]) -> dict:
    groups = grouped(chunks)
    if not chunks:
        return {
            "query": query,
            "abstain": True,
            "answer": "I cannot verify this from the current PI metadata/source index.",
            "principles": [],
            "procedures_forms": [],
            "missing_information": ["No retrieved source chunk met the minimum evidence threshold."],
            "review_status": "source_missing_lawyer_review_required",
        }
    return {
        "query": query,
        "abstain": False,
        "answer": "Retrieved source-backed PI workflow candidates. This is a research layer only; lawyer review is required before advice or drafting.",
        "principles": summarize_group(groups["principles"]),
        "procedures_forms": summarize_group(groups["procedures_forms"]),
        "missing_information": infer_missing(chunks),
        "review_status": "draft_only_lawyer_review_required",
    }


def summarize_group(chunks: list[dict]) -> list[dict]:
    out = []
    for c in chunks[:8]:
        meta = c.get("metadata", {})
        out.append({
            "title": c.get("title"),
            "source": c.get("source_file"),
            "citation": c.get("citation"),
            "pinpoint": c.get("pinpoint"),
            "score": c.get("score"),
            "quote": c.get("quote"),
            "required_facts": meta.get("required_facts", []),
            "review_status": c.get("review_status"),
            "output_mode": c.get("output_mode"),
        })
    return out


def infer_missing(chunks: list[dict]) -> list[str]:
    seen = []
    for c in chunks[:6]:
        for fact in c.get("metadata", {}).get("required_facts", []) or []:
            if fact not in seen and len(seen) < 12:
                seen.append(fact)
    return seen


def deepseek_compose(query: str, answer: dict, model: str) -> dict | None:
    key = os.getenv("DEEPSEEK_API_KEY", "").strip()
    if not key:
        return None
    req = urllib.request.Request(
        "https://api.deepseek.com/chat/completions",
        data=json.dumps({
            "model": model,
            "temperature": 0,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": "You are a fail-closed legal workflow summarizer. Use only supplied sources. If unsupported, abstain. Return JSON only."},
                {"role": "user", "content": json.dumps({"query": query, "retrieved_answer": answer}, ensure_ascii=False)},
            ],
        }).encode("utf-8"),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        return json.loads(payload["choices"][0]["message"]["content"])
    except (urllib.error.URLError, KeyError, json.JSONDecodeError, TimeoutError) as exc:
        return {"error": str(exc)}


def main() -> int:
    parser = argparse.ArgumentParser(description="Query the PI RAG metadata index.")
    parser.add_argument("query")
    parser.add_argument("--limit", type=int, default=12)
    parser.add_argument("--min-score", type=float, default=2.0)
    parser.add_argument("--use-deepseek", action="store_true")
    parser.add_argument("--deepseek-model", default=os.getenv("DEEPSEEK_MODEL", "deepseek-chat"))
    args = parser.parse_args()

    index = json.loads(INDEX.read_text(encoding="utf-8"))
    chunks = retrieve(index, args.query, args.limit, args.min_score)
    answer = build_fail_closed_answer(args.query, chunks)
    if args.use_deepseek:
        answer["deepseek_summary"] = deepseek_compose(args.query, answer, args.deepseek_model) or {"status": "not_used_no_api_key"}
    print(json.dumps(answer, ensure_ascii=False, indent=2))
    return 0 if chunks else 2


if __name__ == "__main__":
    sys.exit(main())
