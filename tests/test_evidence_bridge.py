import copy
import json
import unittest
from pathlib import Path

import sys

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "scripts"))

from export_doctrine_nodes import collect_domain, domain_dirs
from search_evidence_trace import answer_query
from validate_evidence_links import validate_evidence


class EvidenceBridgeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.evidence = json.loads((REPO_ROOT / "data/evidence/example_evidence_bridge.json").read_text())
        cls.doctrine_ids = set()
        for domain_id, domain_dir in domain_dirs():
            nodes, errors = collect_domain(domain_id, domain_dir)
            assert not errors
            cls.doctrine_ids.update(n["doctrine_node_id"] for n in nodes)

    def test_example_evidence_validates(self):
        valid, rejected = validate_evidence(self.evidence, self.doctrine_ids)
        self.assertEqual(1, len(valid))
        self.assertEqual([], rejected)

    def test_unknown_doctrine_node_rejected(self):
        evidence = copy.deepcopy(self.evidence)
        evidence["proposition_doctrine_links"][0]["doctrine_node_id"] = "missing.node"
        valid, rejected = validate_evidence(evidence, self.doctrine_ids)
        self.assertEqual([], valid)
        self.assertIn("unknown_doctrine_node_id", rejected[0]["reasons"])

    def test_quote_must_exist_in_paragraph(self):
        evidence = copy.deepcopy(self.evidence)
        evidence["proposition_cards"][0]["supporting_quote"] = "invented words not in paragraph"
        valid, rejected = validate_evidence(evidence, self.doctrine_ids)
        self.assertEqual([], valid)
        self.assertIn("supporting_quote_not_found", rejected[0]["reasons"])

    def test_answer_safe_promotion_rejected_without_review(self):
        evidence = copy.deepcopy(self.evidence)
        evidence["proposition_doctrine_links"][0]["verification_status"] = "answer_safe"
        valid, rejected = validate_evidence(evidence, self.doctrine_ids)
        self.assertEqual([], valid)
        self.assertIn("safe_status_requires_human_review", rejected[0]["reasons"])

    def test_search_returns_trace_and_abstention_warning(self):
        result = answer_query("dishonesty theft actual knowledge", self.evidence)
        self.assertIn("criminal_law_hk", result["detected_domains"])
        self.assertIn("insufficient_authority", result["warnings"])
        self.assertEqual("low", result["answer_confidence"])
        self.assertTrue(result["evidence_trace"])


if __name__ == "__main__":
    unittest.main()
