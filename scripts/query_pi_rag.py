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


def detect_routes(query: str) -> set[str]:
    q = query.lower()
    routes: set[str] = set()
    if any(term in q for term in ["form", "writ", "draft", "fill", "template", "statement of claim", "schedule of damages"]):
        routes.add("forms")
    if any(term in q for term in ["procedure", "steps", "sop", "checklist", "cmc", "ptr", "pre-action", "discovery"]):
        routes.add("procedure")
    if any(term in q for term in ["law", "test", "element", "defence", "duty", "breach", "causation", "quantum", "damages", "limitation"]):
        routes.add("principles")
    if any(term in q for term in ["workplace", "employee", "employer", "work injury", "work accident", "injured at work", "at work", "industrial", "occupational disease"]):
        routes.add("workplace")
    if any(term in q for term in ["court", "forum", "jurisdiction", "cfi", "district court", "small claims", "claim value", "hk$", "hk $", "75000", "75,000", "3m", "3 million"]):
        routes.add("court_band")
    if any(term in q for term in ["limitation", "deadline", "time limit", "out of time"]):
        routes.add("limitation")
    return routes


def route_adjustment(chunk: dict, routes: set[str], query: str) -> float:
    blob = " ".join([
        str(chunk.get("chunk_id", "")),
        str(chunk.get("layer", "")),
        str(chunk.get("title", "")),
        str(chunk.get("source_file", "")),
        str(chunk.get("citation", "")),
        str(chunk.get("pinpoint", "")),
        " ".join(str(x) for x in chunk.get("metadata", {}).get("trigger_conditions", []) or []),
        " ".join(str(x) for x in chunk.get("metadata", {}).get("linked_procedure_nodes", []) or []),
    ]).lower()
    boost = 0.0
    if "principles" in routes and chunk.get("layer") == "principles":
        boost += 2.0
    if "procedure" in routes and chunk.get("layer") == "procedures_forms":
        boost += 1.5
    if "forms" in routes and ("form" in blob or "writ" in blob or "template" in blob):
        boost += 2.5
    if "workplace" in routes and any(term in blob for term in ["workplace", "employer", "employee", "eco_form", "employees' compensation", "occupational"]):
        boost += 4.0
    if "workplace" in routes and ("eco_form" in blob or "employees' compensation" in blob):
        boost += 8.0
    if "limitation" in routes and "limitation" in blob:
        boost += 5.0
    if "court_band" in routes:
        if any(term in blob for term in ["forum_jurisdiction", "court_band", "district court", "cfi", "small claims", "dc_writ", "cfi_writ"]):
            boost += 8.0
        if chunk.get("source_file") == "pi_form_inventory.json" and not any(term in blob for term in ["writ", "court", "district", "cfi"]):
            boost -= 6.0
    if "district court" in query.lower() and any(term in blob for term in ["dc_writ", "district court"]):
        boost += 8.0
    return boost


def retrieve(index: dict, query: str, limit: int, min_score: float) -> list[dict]:
    terms = tokenize(query)
    routes = detect_routes(query)
    scored = []
    for chunk in index.get("chunks", []):
        score = score_chunk(terms, chunk) + route_adjustment(chunk, routes, query)
        if score >= min_score:
            scored.append({**chunk, "score": round(score, 3)})
    scored.sort(key=lambda c: (-c["score"], c["layer"], c["title"]))
    return scored[:limit]


def grouped(chunks: list[dict]) -> dict[str, list[dict]]:
    return {
        "principles": [c for c in chunks if c.get("layer") == "principles"],
        "procedures_forms": [c for c in chunks if c.get("layer") == "procedures_forms"],
        "governance": [c for c in chunks if c.get("layer") == "governance"],
    }


def build_fail_closed_answer(query: str, chunks: list[dict]) -> dict:
    groups = grouped(chunks)
    if not chunks:
        return {
            "query": query,
            "routes": sorted(detect_routes(query)),
            "abstain": True,
            "answer": "I cannot verify this from the current PI metadata/source index.",
            "principles": [],
            "procedures_forms": [],
            "verification": [],
            "missing_information": ["No retrieved source chunk met the minimum evidence threshold."],
            "review_status": "source_missing_lawyer_review_required",
        }
    return {
        "query": query,
        "routes": sorted(detect_routes(query)),
        "abstain": False,
        "answer": "Retrieved source-backed PI workflow candidates. This is a research layer only; lawyer review is required before advice or drafting.",
        "principles": summarize_group(groups["principles"]),
        "procedures_forms": summarize_group(groups["procedures_forms"]),
        "verification": summarize_group(groups["governance"])[:5],
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
