#!/usr/bin/env python3
import hashlib
import json
import re
import ssl
import subprocess
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "data" / "legal_ingest" / "tree_gap_pilots" / "data_privacy_dpp1_v1"
TMP_DIR = Path("/tmp/hk-data-privacy-pilot")

SOURCE = {
    "source_id": "hk_cfi_2008_cathay_pacific_hcal_50_2008",
    "case_id": "hk_cfi_2008_cathay_pacific_hcal_50_2008",
    "case_name": "Cathay Pacific Airways Ltd v Administrative Appeals Board and Another",
    "neutral_citation": "[2008] 5 HKLRD 539",
    "court": "Court of First Instance",
    "court_level": "CFI",
    "date": "2008-08-28",
    "source_kind": "case_judgment",
    "source_visibility": "public_demo",
    "tenant_id": "public",
    "licence_status": "public_judgment",
    "source_url_or_path": "https://www.pcpd.org.hk/sc_chi/enforcement/judgments/files/HCAL000050_2008.pdf",
    "fetch_url": "https://www.pcpd.org.hk/sc_chi/enforcement/judgments/files/HCAL000050_2008.pdf",
    "source_format": "official_pdf_public_judgment",
    "ingestion_status": "source_candidate",
    "authority_status": "real_public_authority_candidate",
}

RULES = [
    {
        "rule_id": "cathay_2008_pdpo_scope_p1",
        "paragraph_no": "1",
        "proposition_id": "prop_cathay_2008_pdpo_employee_data_scope_p1",
        "proposition_text": "The CFI described the PDPO as protecting privacy in relation to personal information and requiring an employer collecting employee personal data to do so only as provided and specified in the Ordinance.",
        "exact_quote": "If an employer (a data user) wishes to collect in a recorded form personal data of its employees",
        "target_doctrine_node_ids": ["data_privacy_hk", "data_privacy_hk.dpp1.collection_purpose"],
        "significance_label": "states_context",
        "authority_role": "background_or_applied_context",
        "confidence": "medium",
    },
    {
        "rule_id": "cathay_2008_dpp1_purpose_necessity_p4",
        "paragraph_no": "4",
        "proposition_id": "prop_cathay_2008_dpp1_purpose_necessity_nonexcessive_p4",
        "proposition_text": "DPP1(1) requires personal data collection to be for a lawful purpose directly related to the data user's function or activity, necessary or directly related to that purpose, and adequate but not excessive.",
        "exact_quote": "the collection of the data is necessary for or directly related to that purpose",
        "target_doctrine_node_ids": ["data_privacy_hk.dpp1.collection_purpose"],
        "significance_label": "states_rule",
        "authority_role": "statutory_text_recited",
        "confidence": "high",
    },
    {
        "rule_id": "cathay_2008_dpp1_fair_collection_p5",
        "paragraph_no": "5",
        "proposition_id": "prop_cathay_2008_dpp1_lawful_fair_collection_p5",
        "proposition_text": "DPP1(2) requires personal data to be collected by lawful means and by means fair in the circumstances of the case.",
        "exact_quote": "fair in the circumstances of the case",
        "target_doctrine_node_ids": ["data_privacy_hk.dpp1.collection_fairness"],
        "significance_label": "states_rule",
        "authority_role": "statutory_text_recited",
        "confidence": "high",
    },
    {
        "rule_id": "cathay_2008_medical_data_necessary_p17",
        "paragraph_no": "17",
        "proposition_id": "prop_cathay_2008_medical_data_necessary_not_excessive_p17",
        "proposition_text": "The Commissioner accepted that Cathay's collection of medical data under the AMP was directly related to its airline obligations, necessary, and not excessive because it was tied to absence from work.",
        "exact_quote": "the collection of medical data in terms of the AMP was directly related to the discharge of Cathay’s obligations",
        "target_doctrine_node_ids": ["data_privacy_hk.dpp1.collection_purpose", "data_privacy_hk.employment.medical_records"],
        "significance_label": "applies_rule",
        "authority_role": "procedural_history_commissioner_finding",
        "confidence": "medium",
    },
    {
        "rule_id": "cathay_2008_consent_pressure_p36",
        "paragraph_no": "36",
        "proposition_id": "prop_cathay_2008_consent_pressure_fairness_issue_p36",
        "proposition_text": "The Commissioner reasoned that Cathay's employees were made to give consent under threat or fear of disciplinary process; this was treated as the core fairness issue.",
        "exact_quote": "the crew were made to give consent under the threat or for fear of a disciplinary process",
        "target_doctrine_node_ids": ["data_privacy_hk.dpp1.collection_fairness", "data_privacy_hk.employment.medical_records"],
        "significance_label": "states_issue",
        "authority_role": "procedural_history_commissioner_reasoning",
        "confidence": "medium",
    },
    {
        "rule_id": "cathay_2008_incorrect_construction_p50",
        "paragraph_no": "50",
        "proposition_id": "prop_cathay_2008_fairness_construction_set_aside_p50",
        "proposition_text": "The CFI held that the Commissioner and Board had adopted an incorrect construction of the true meaning and intent of DPP1(2), and set aside the decisions to that extent.",
        "exact_quote": "both the decision of the Commissioner and the judgment of the Board were based on an incorrect construction of the true meaning and intent",
        "target_doctrine_node_ids": ["data_privacy_hk.dpp1.collection_fairness", "data_privacy_hk.enforcement.appeals"],
        "significance_label": "holding",
        "authority_role": "ratio",
        "confidence": "high",
    },
]


def sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def collapse(value: str) -> str:
    return re.sub(r"\s+", " ", value.replace("\u00a0", " ")).strip()


def fetch_pdf() -> Path:
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    path = TMP_DIR / "HCAL000050_2008.pdf"
    if path.exists() and path.stat().st_size > 10_000:
        return path
    try:
        subprocess.run(
            ["curl", "-L", "-sS", "--max-time", "45", "-o", str(path), SOURCE["fetch_url"]],
            check=True,
        )
    except Exception:
        context = ssl._create_unverified_context()
        with urllib.request.urlopen(SOURCE["fetch_url"], context=context, timeout=45) as response:
            path.write_bytes(response.read(20_000_000))
    return path


def pdf_text(path: Path) -> str:
    reader = PdfReader(str(path))
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    text = re.sub(r"\n\s*[A-V]\s*(?=\n)", "\n", text)
    text = re.sub(r"\n\s*由此\s*\n", "\n", text)
    text = re.sub(r"\n\s*-\s*\d+\s*-\s*\n", "\n", text)
    text = re.sub(r"[ \t]+", " ", text)
    return text


def numbered_paragraphs(text: str) -> dict[str, str]:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    starts = []
    for i, line in enumerate(lines):
        match = re.match(r"^(\d+)\.\s", line)
        if match:
            starts.append((i, match.group(1)))
    out = {}
    for idx, (start, number) in enumerate(starts):
        end = starts[idx + 1][0] if idx + 1 < len(starts) else len(lines)
        out[number] = collapse(" ".join(lines[start:end]))
    return out


def write_json(name: str, payload) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / name).write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def build() -> None:
    pdf_path = fetch_pdf()
    paras = numbered_paragraphs(pdf_text(pdf_path))
    generated_at = datetime.now(timezone.utc).isoformat()
    paragraphs = []
    propositions = []
    links = []
    l4 = []
    l5 = []
    review_items = []
    rejected = []
    seen_para = set()

    for rule in RULES:
        para = paras.get(rule["paragraph_no"], "")
        quote = collapse(rule["exact_quote"])
        if not para:
            rejected.append({"rule_id": rule["rule_id"], "reason": "paragraph_not_found", "paragraph_no": rule["paragraph_no"]})
            continue
        if quote not in para:
            rejected.append({"rule_id": rule["rule_id"], "reason": "exact_quote_not_found", "paragraph_no": rule["paragraph_no"]})
            continue
        paragraph_id = f'{SOURCE["case_id"]}_p{rule["paragraph_no"]}'
        if paragraph_id not in seen_para:
            seen_para.add(paragraph_id)
            paragraphs.append({
                "paragraph_id": paragraph_id,
                "case_id": SOURCE["case_id"],
                "paragraph_no": rule["paragraph_no"],
                "text": para,
                "chunk_hash": sha256(f'{SOURCE["case_id"]}:{rule["paragraph_no"]}:{para}'),
                "source_url": SOURCE["source_url_or_path"],
                "source_visibility": "public_demo",
                "tenant_id": "public",
                "fixture_status": "real_public_source_tree_gap_pilot",
                "authority_status": "real_public_authority_candidate",
            })
        propositions.append({
            "proposition_id": rule["proposition_id"],
            "case_id": SOURCE["case_id"],
            "paragraph_id": paragraph_id,
            "source_paragraph": rule["paragraph_no"],
            "exact_quote": rule["exact_quote"],
            "proposition_text": rule["proposition_text"],
            "tree_node_ids": rule["target_doctrine_node_ids"],
            "target_doctrine_node_ids": rule["target_doctrine_node_ids"],
            "significance_label": rule["significance_label"],
            "authority_role": rule["authority_role"],
            "confidence": rule["confidence"],
            "review_state": "machine_candidate",
            "answer_safe": False,
            "human_review_required": True,
            "source_visibility": "public_demo",
            "tenant_id": "public",
            "fixture_status": "real_public_source_tree_gap_pilot",
            "authority_status": "real_public_authority_candidate",
            "source_url": SOURCE["source_url_or_path"],
        })
        for node_id in rule["target_doctrine_node_ids"]:
            links.append({
                "link_id": f'{rule["proposition_id"]}__{node_id}',
                "proposition_id": rule["proposition_id"],
                "doctrine_node_id": node_id,
                "link_type": "candidate",
                "authority_role": rule["authority_role"],
                "significance_label": rule["significance_label"],
                "confidence": 0.78 if rule["confidence"] == "high" else 0.68,
                "linking_method": "notebooklm_field_queue_plus_public_pdf_exact_quote_v1",
                "review_status": "machine_candidate",
                "answer_layer_status": "candidate_only",
                "human_review_required": True,
                "notes": "Data privacy branch proposed as candidate expansion; quote verified from public official judgment PDF.",
                "source_visibility": "public_demo",
                "tenant_id": "public",
            })
        l4.append({
            "l4_application_id": f'{rule["proposition_id"]}_application',
            "proposition_id": rule["proposition_id"],
            "case_id": SOURCE["case_id"],
            "case_name": SOURCE["case_name"],
            "neutral_citation": SOURCE["neutral_citation"],
            "application_summary": rule["proposition_text"],
            "significance_label": rule["significance_label"],
            "authority_role": rule["authority_role"],
            "review_status": "machine_candidate",
            "answer_layer_status": "candidate_only",
        })
        l5.append({
            "l5_proof_id": f'{rule["proposition_id"]}_proof',
            "proposition_id": rule["proposition_id"],
            "case_id": SOURCE["case_id"],
            "paragraph_id": paragraph_id,
            "para_no": rule["paragraph_no"],
            "exact_quote": rule["exact_quote"],
            "paragraph_text": para,
            "source_url": SOURCE["source_url_or_path"],
            "quote_validation_status": "exact_quote_found_in_public_paragraph",
            "review_status": "machine_candidate",
            "answer_layer_status": "candidate_only",
        })
        review_items.append({
            "review_item_id": f'review_{rule["proposition_id"]}',
            "item_type": "proposition_card",
            "item_id": rule["proposition_id"],
            "status": "open",
            "review_status": "machine_candidate",
            "human_review_required": True,
            "payload_json": {
                "case_id": SOURCE["case_id"],
                "neutral_citation": SOURCE["neutral_citation"],
                "paragraph_id": paragraph_id,
                "paragraph_no": rule["paragraph_no"],
                "exact_quote": rule["exact_quote"],
                "proposition_text": rule["proposition_text"],
                "target_doctrine_node_ids": rule["target_doctrine_node_ids"],
            },
        })

    manifest = {
        "batch_id": "data_privacy_dpp1_tree_gap_pilot_v1",
        "domain_id": "data_privacy_hk",
        "scope": "data_privacy_dpp1_employment_medical_records_candidate_branch",
        "source_policy": {
            "public_sources_only": True,
            "private_or_licensed_sources_allowed": False,
            "raw_private_upload_allowed": False,
            "bulk_auto_attach_allowed": False,
            "answer_safe_by_default": False,
        },
        "sources": [SOURCE],
        "tree_gap_resolution": {
            "existing_tree_match": "new_domain_pack_candidate_created",
            "tree_proposal_source": "notebooklm_field_expansion_queue_v1",
            "tree_proposal_status": "candidate_only",
            "verification_gate": "official_public_pdf_exact_quote_case_fruits_only",
        },
    }
    cases_payload = {"cases": [{**SOURCE, "source_url_or_path": SOURCE["source_url_or_path"], "ingestion_status": "paragraphized"}], "paragraph_cards": paragraphs}
    report = {
        "artifact_id": "data_privacy_dpp1_tree_gap_pilot_v1",
        "generated_at": generated_at,
        "batch_id": manifest["batch_id"],
        "source_count": 1,
        "paragraph_count": len(paragraphs),
        "proposition_count": len(propositions),
        "link_count": len(links),
        "review_item_count": len(review_items),
        "rejected_count": len(rejected),
        "rejected": rejected,
        "status": "built_quote_verified_candidate" if not rejected else "built_with_rejections",
    }

    write_json("source_manifest.json", manifest)
    write_json("paragraph_cards.json", cases_payload)
    write_json("proposition_cards.json", {"proposition_cards": propositions})
    write_json("proposition_node_links.json", {"proposition_node_links": links})
    write_json("l4_case_applications.json", {"l4_case_applications": l4})
    write_json("l5_paragraph_proof.json", {"l5_paragraph_proof": l5})
    write_json("review_queue.json", {"review_items": review_items})
    write_json("case_fruits_artifact.json", {
        "artifact_id": "data_privacy_dpp1_case_fruits_v1",
        "source_manifest": "source_manifest.json",
        "paragraph_cards": "paragraph_cards.json",
        "proposition_cards": "proposition_cards.json",
        "proposition_node_links": "proposition_node_links.json",
        "l4_case_applications": "l4_case_applications.json",
        "l5_paragraph_proof": "l5_paragraph_proof.json",
        "review_queue": "review_queue.json",
        "status": "candidate_only_requires_review",
    })
    write_json("parse_report.json", report)
    print(json.dumps(report, indent=2))
    if rejected:
        raise SystemExit(1)


if __name__ == "__main__":
    build()
