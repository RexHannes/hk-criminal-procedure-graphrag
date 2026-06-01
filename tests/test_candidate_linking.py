from __future__ import annotations

import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

from deepseek_candidate_linker import generate_candidates  # noqa: E402
from validate_candidate_links import (  # noqa: E402
    load_authority_lookup,
    load_doctrine_nodes,
    validate_candidate,
    validate_candidates,
)


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload), encoding="utf-8")


class CandidateLinkingTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.nodes_root = self.root / "nodes"
        write_json(
            self.nodes_root / "04_bail.json",
            {
                "nodes": [
                    {
                        "id": "bail_right_to_bail",
                        "type": "legal_issue",
                        "label": "Right to Bail",
                        "summary": "Presumption and refusal grounds under Cap 221 s.9D.",
                    },
                    {
                        "id": "cap221_s9d",
                        "type": "statute",
                        "label": "Cap 221 s.9D",
                        "summary": "Right to bail and statutory exceptions.",
                    },
                ]
            },
        )
        self.authority_index = self.root / "legal_authority_index.json"
        write_json(
            self.authority_index,
            {
                "cases": [
                    {
                        "id": "case:one",
                        "case_name": "HKSAR v Bail Authority",
                        "neutral_citation": "[2024] HKCFI 1",
                    }
                ],
                "paragraphs": [
                    {
                        "id": "p1",
                        "case_id": "case:one",
                        "text": "The court applied Cap 221 section 9D and considered substantial grounds for refusing bail.",
                    }
                ],
                "propositions": [
                    {
                        "id": "prop:one",
                        "case_id": "case:one",
                        "proposition_text": "The court applied Cap 221 section 9D and considered substantial grounds for refusing bail.",
                        "proposition_type": "rule",
                        "supporting_paragraph_ids": ["p1"],
                    }
                ],
            },
        )
        self.nodes = load_doctrine_nodes(self.nodes_root)
        self.authority = load_authority_lookup(self.authority_index)

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def candidate(self, **overrides):
        payload = {
            "proposition_id": "prop:one",
            "candidate_doctrine_node_id": "bail_right_to_bail",
            "link_type": "illustrative",
            "confidence": 0.7,
            "supporting_quote": "Cap 221 section 9D",
            "reason": "The paragraph concerns bail refusal grounds.",
            "verification_status": "machine_candidate",
            "answer_layer_status": "not_answer_safe",
            "risks": [],
        }
        payload.update(overrides)
        return payload

    def test_valid_candidate_is_accepted(self) -> None:
        accepted, errors = validate_candidate(self.candidate(), doctrine_nodes=self.nodes, authority=self.authority)

        self.assertEqual(errors, [])
        self.assertIsNotNone(accepted)
        self.assertEqual(accepted["verification_status"], "machine_candidate")
        self.assertEqual(accepted["answer_layer_status"], "not_answer_safe")

    def test_rejects_unknown_doctrine_node(self) -> None:
        accepted, errors = validate_candidate(
            self.candidate(candidate_doctrine_node_id="missing_node"),
            doctrine_nodes=self.nodes,
            authority=self.authority,
        )

        self.assertIsNone(accepted)
        self.assertIn("unknown_doctrine_node_id:missing_node", errors)

    def test_rejects_unsupported_quote(self) -> None:
        accepted, errors = validate_candidate(
            self.candidate(supporting_quote="Invented quote not in paragraph"),
            doctrine_nodes=self.nodes,
            authority=self.authority,
        )

        self.assertIsNone(accepted)
        self.assertIn("supporting_quote_not_found_in_source_paragraph", errors)

    def test_rejects_answer_safe_or_verified_candidate(self) -> None:
        accepted, errors = validate_candidate(
            self.candidate(verification_status="paragraph_verified", answer_layer_status="answer_safe"),
            doctrine_nodes=self.nodes,
            authority=self.authority,
        )

        self.assertIsNone(accepted)
        self.assertIn("candidate_may_not_be_answer_safe_or_verified", errors)

    def test_rejects_legal_test_link_without_doctrinal_anchor(self) -> None:
        write_json(
            self.authority_index,
            {
                "cases": [{"id": "case:two"}],
                "paragraphs": [{"id": "p2", "case_id": "case:two", "text": "The accused arrived at court late."}],
                "propositions": [
                    {
                        "id": "prop:two",
                        "case_id": "case:two",
                        "proposition_text": "The accused arrived at court late.",
                        "supporting_paragraph_ids": ["p2"],
                    }
                ],
            },
        )
        authority = load_authority_lookup(self.authority_index)
        accepted, errors = validate_candidate(
            self.candidate(
                proposition_id="prop:two",
                link_type="leading_authority",
                supporting_quote="accused arrived at court late",
                reason="Pure factual chronology.",
            ),
            doctrine_nodes=self.nodes,
            authority=authority,
        )

        self.assertIsNone(accepted)
        self.assertIn("legal_test_link_lacks_doctrinal_anchor", errors)

    def test_batch_validation_reports_accepted_and_rejected(self) -> None:
        report = validate_candidates(
            [self.candidate(), self.candidate(candidate_doctrine_node_id="missing_node")],
            doctrine_nodes=self.nodes,
            authority=self.authority,
        )

        self.assertEqual(report["accepted_count"], 1)
        self.assertEqual(report["rejected_count"], 1)

    def test_dry_run_candidate_generation_stays_not_answer_safe(self) -> None:
        candidates = generate_candidates(
            doctrine_nodes=self.nodes,
            authority=self.authority,
            max_propositions=5,
            no_llm=True,
            dry_run=True,
            model="deepseek-chat",
            api_url="https://api.deepseek.com/chat/completions",
        )

        self.assertTrue(candidates)
        self.assertEqual(candidates[0]["verification_status"], "machine_candidate")
        self.assertEqual(candidates[0]["answer_layer_status"], "not_answer_safe")


if __name__ == "__main__":
    unittest.main()
