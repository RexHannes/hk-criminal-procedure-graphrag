"""Paragraph-aware chunking for legal RAG ingestion.

This module creates chunk metadata for vector/search systems without weakening
the source-card gate. Private chunks may be embedded in a private namespace, but
public manifests should carry references and hashes rather than raw book text.
"""

from __future__ import annotations

import hashlib
import re
from typing import Any


PARA_RE = re.compile(r"(?m)^\s*(?:\[(?P<bracket>\d+[A-Za-z]?)\]|(?P<plain>\d+[A-Za-z]?)\.)\s+")


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def split_numbered_paragraphs(text: str) -> list[dict[str, str]]:
    """Split HK-style numbered paragraphs while preserving paragraph numbers."""

    matches = list(PARA_RE.finditer(text))
    if not matches:
        cleaned = text.strip()
        return [{"para_no": "unparsed", "text": cleaned}] if cleaned else []

    paragraphs: list[dict[str, str]] = []
    for idx, match in enumerate(matches):
        start = match.end()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
        para_no = match.group("bracket") or match.group("plain") or str(idx + 1)
        body = text[start:end].strip()
        if body:
            paragraphs.append({"para_no": para_no, "text": body})
    return paragraphs


def chunk_paragraphs(
    paragraphs: list[dict[str, str]],
    *,
    source_id: str,
    citation: str = "",
    max_chars: int = 1800,
    overlap_paragraphs: int = 1,
    emit_text: bool = False,
) -> list[dict[str, Any]]:
    """Bundle paragraphs into stable chunks.

    `emit_text=False` is the default for public manifests to avoid leaking
    licensed/private raw content. The ingestion worker can still pass raw text to
    an embedding provider inside the private vault runtime.
    """

    chunks: list[dict[str, Any]] = []
    window: list[dict[str, str]] = []

    def flush() -> None:
        if not window:
            return
        text = "\n".join(f"[{p['para_no']}] {p['text']}" for p in window)
        first = window[0]["para_no"]
        last = window[-1]["para_no"]
        chunk_id = f"{source_id}:paras:{first}-{last}:{sha256_text(text)[:12]}"
        chunk: dict[str, Any] = {
            "chunk_id": chunk_id,
            "source_id": source_id,
            "citation": citation,
            "pinpoint": f"paras {first}-{last}" if first != last else f"para {first}",
            "para_start": first,
            "para_end": last,
            "char_count": len(text),
            "chunk_hash": sha256_text(text),
            "text_ref": f"vault://legal-ingest/{source_id}/{chunk_id}",
        }
        if emit_text:
            chunk["text"] = text
        chunks.append(chunk)

    for paragraph in paragraphs:
        candidate = window + [paragraph]
        candidate_text = "\n".join(f"[{p['para_no']}] {p['text']}" for p in candidate)
        if window and len(candidate_text) > max_chars:
            flush()
            window = window[-overlap_paragraphs:] if overlap_paragraphs else []
        window.append(paragraph)

    flush()
    return chunks


def chunk_legal_text(
    text: str,
    *,
    source_id: str,
    citation: str = "",
    max_chars: int = 1800,
    emit_text: bool = False,
) -> list[dict[str, Any]]:
    paragraphs = split_numbered_paragraphs(text)
    return chunk_paragraphs(
        paragraphs,
        source_id=source_id,
        citation=citation,
        max_chars=max_chars,
        emit_text=emit_text,
    )
