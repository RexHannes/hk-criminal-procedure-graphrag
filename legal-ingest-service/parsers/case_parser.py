"""Case parser v1: preserves paragraph-level legal units."""

from __future__ import annotations

import re
from typing import Any


PARA_RE = re.compile(r"^\s*(?:\[(?P<bracket>\d+)\]|(?P<plain>\d+)[.)])\s+(?P<text>.+)")


def parse_case_text_to_paragraphs(
    *,
    source_id: str,
    citation: str,
    text: str,
    jurisdiction: str = "Hong Kong",
    court: str = "",
) -> list[dict[str, Any]]:
    """Parse numbered judgment text into paragraph cards.

    This helper is deliberately conservative. If paragraph numbers cannot be
    identified, it emits no cards rather than making artificial pinpoints.
    """

    cards: list[dict[str, Any]] = []
    current_no: str | None = None
    current_lines: list[str] = []

    def flush() -> None:
        if not current_no or not current_lines:
            return
        paragraph_text = " ".join(line.strip() for line in current_lines if line.strip())
        cards.append(
            {
                "paragraph_id": f"{source_id}_p{current_no}",
                "source_id": source_id,
                "para_no": current_no,
                "paragraph_text": paragraph_text,
                "court": court,
                "citation": citation,
                "jurisdiction": jurisdiction,
                "issue_tags": [],
                "visibility": "public_source",
                "verification_status": "machine_candidate",
                "answer_layer_status": "research_only",
            }
        )

    for line in text.splitlines():
        match = PARA_RE.match(line)
        if match:
            flush()
            current_no = match.group("bracket") or match.group("plain")
            current_lines = [match.group("text")]
        elif current_no and line.strip():
            current_lines.append(line.strip())
    flush()
    return cards

