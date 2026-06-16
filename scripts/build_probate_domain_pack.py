#!/usr/bin/env python3
"""Build a metadata-only Hong Kong Probate domain pack.

The builder intentionally uses file names, source hashes and short taxonomy
seeds only. It does not extract or commit proprietary Butterworths text or form
precedent wording.
"""

from __future__ import annotations

import hashlib
import json
import re
import zipfile
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data" / "legal_domain_packs" / "demo_maps" / "probate_law_hk"
SOURCE_BASE = Path(
    "/Users/puiyuenwong/Desktop/桌面 - Pui的MacBook Air/Real uni (1)/PCLL 2023 "
    "/Haldanes demo try /PCLL - Sem A/Sem B"
)
PROBATE_FORMS_ZIP = SOURCE_BASE / "Probate forms.ZIP"
PROBATE_PRACTICE_ZIP = SOURCE_BASE / "probate 1.ZIP"
BUTTERWORTHS_PDF = SOURCE_BASE / "Butterworths Hong Kong Probate, Administration &amp_ Trustee(2)_p252-502.pdf"


STATUS = {
    "not_product_answer_layer": True,
    "needs_hklii_verification": True,
    "needs_official_source_verification": True,
    "authority_status": "licensed_private_metadata_seed",
}

COMMON_NODE_STATUS = {
    "source_basis": "licensed_private_metadata_seed",
    "source_card_ids": [],
    "verification_status": "needs_source_card_verification",
    "answer_layer_status": "not_product_answer_layer",
    "authority_status": "practice_seed_needs_authority",
    "human_review_status": "unreviewed",
    "candidate_evidence_count": 0,
}

COMMON_FORM_STATUS = {
    "source_status": "licensed_private_metadata_seed",
    "copyright_status": "metadata_only_no_full_text_reproduced",
    "review_status": "machine_extracted_candidate",
    "output_mode": "draft_only_lawyer_review_required",
}


PRINCIPLE_GROUPS: list[tuple[str, str, str, list[tuple[str, str, str, list[str]]]]] = [
    (
        "jurisdiction_business",
        "Probate Jurisdiction and Business Types",
        "Routes and institutional allocation for Hong Kong probate work, separating common-form registry work from contentious or solemn-form proceedings.",
        [
            ("common_form", "Common Form / Non-Contentious Probate", "Identifies registry/common-form applications where the grant is sought without a live probate dispute.", ["grant type", "whether any caveat or dispute exists", "applicant capacity"]),
            ("solemn_form", "Solemn Form / Contentious Probate", "Flags contentious probate proceedings where validity, entitlement or revocation must be litigated.", ["dispute nature", "will/grant challenged", "parties with interest"]),
            ("registrar_jurisdiction", "Registrar Route", "Covers applications or requisitions dealt with by the Probate Registry or Registrar subject to source verification.", ["application type", "registry requisition", "directions required"]),
            ("judge_route", "Judge / Court Route", "Routes matters requiring summons, judge directions, contentious gateway or court order.", ["order sought", "respondents", "supporting evidence"]),
            ("personal_vs_solicitor", "Personal Applicant vs Solicitor Application", "Separates personal applicant handling from solicitor-led applications and registry communication.", ["applicant represented", "capacity", "contact details"]),
        ],
    ),
    (
        "grant_entitlement",
        "Grant Type and Entitlement",
        "Determines the proper grant and applicant priority before any form/template recommendation.",
        [
            ("probate_executor", "Probate to Executor", "Grant route where an executor named in the will applies.", ["will", "executor identity", "death evidence"]),
            ("admin_with_will_annexed", "Administration with Will Annexed", "Grant route where there is a will but no acting executor able/willing to prove it.", ["will", "executor position", "person entitled"]),
            ("intestate_administration", "Intestate Administration", "Letters of administration route where no valid will is being proved.", ["next of kin", "relationship", "renunciations/consents"]),
            ("renunciation_retraction", "Renunciation and Retraction", "Tracks renunciation of probate/administration and applications to retract renunciation.", ["renunciation form", "reason for retraction", "affected persons"]),
            ("additional_administrator", "Additional Administrator / Representative", "Covers joinder or addition of an administrator or representative.", ["existing grant", "proposed administrator", "consent/order basis"]),
        ],
    ),
    (
        "will_validity_evidence",
        "Will Validity and Testamentary Evidence",
        "Evidence layer for execution, identity, condition, lost wills and rectification issues.",
        [
            ("due_execution", "Due Execution and Attestation", "Checks whether execution/attestation evidence is required for the will.", ["execution facts", "witnesses", "attestation clause"]),
            ("identity_handwriting_death", "Identity, Handwriting and Death Evidence", "Routes identity/death/handwriting proof where ordinary evidence is insufficient.", ["identity issue", "handwriting witness", "death circumstances"]),
            ("plight_condition_alterations", "Plight, Condition and Alterations", "Flags physical condition, obliteration, interlineation or alteration evidence.", ["condition of will", "alteration", "date/evidence"]),
            ("lost_copy_reconstructed", "Lost, Copy or Reconstructed Will", "Routes applications to prove a lost will, copy will or reconstruction.", ["last custody", "searches", "copy/reconstruction", "consents"]),
            ("nuncupative_privileged", "Nuncupative / Privileged Will", "Metadata route for special oral/privileged will applications.", ["circumstances", "witnesses", "corroboration"]),
            ("rectification", "Rectification of Will", "Flags clerical error or instruction-misunderstanding rectification route.", ["alleged error", "instructions", "drafting evidence", "order sought"]),
        ],
    ),
    (
        "assets_liabilities",
        "Assets, Liabilities and Estate Information",
        "Estate information layer for schedules, corrective affidavits and small-estate/bank release issues.",
        [
            ("schedule_assets_liabilities", "Schedule of Assets and Liabilities", "Collects estate asset/liability information required for registry and administration steps.", ["assets", "liabilities", "valuation date"]),
            ("corrective_additional_schedule", "Corrective Affidavit / Additional Schedule", "Routes corrections or additional schedules when estate information changes.", ["original schedule", "correction", "additional asset/liability"]),
            ("small_estate_bank_release", "Small Estate / Bank Release", "Flags small-estate or bank-release style issues as metadata only pending official verification.", ["asset value", "institution", "release route"]),
        ],
    ),
    (
        "sureties_guarantees",
        "Sureties and Guarantees",
        "Surety/guarantee requirements and enforcement signals for grants where security may be needed.",
        [
            ("surety_required", "When Surety Is Required", "Identifies cases where surety/security may be required before grant.", ["grant type", "minor/incapacity", "administrator status"]),
            ("guarantee_effect", "Guarantee and Leave to Sue Surety", "Tracks guarantee effect and later enforcement against surety as source-verification-required.", ["guarantee", "default", "leave sought"]),
        ],
    ),
    (
        "foreign_resealing",
        "Foreign Grants and Resealing",
        "Metadata route for resealing foreign grants and related correction/document checks.",
        [
            ("designated_route", "Designated Country / Place Route", "Identifies whether a foreign grant may follow a resealing route.", ["foreign grant", "country/place", "deceased domicile"]),
            ("resealing_documents", "Documents for Resealing", "Collects documents and evidence for resealing application.", ["foreign grant", "death evidence", "assets in Hong Kong"]),
            ("resealing_corrections", "Corrections Before / After Sealing", "Flags correction issues before or after sealing.", ["error", "stage", "supporting affidavit"]),
        ],
    ),
    (
        "special_grants",
        "Special Grants and Exceptional Applications",
        "Special grants where ordinary probate/administration route is inadequate.",
        [
            ("pending_suit", "Grant Pending Suit", "Temporary grant route while contentious proceedings are pending.", ["pending action", "estate needs", "administrator candidate"]),
            ("ad_colligenda_bona", "Ad Colligenda Bona", "Preservation grant route for collecting/protecting estate assets.", ["urgent asset risk", "limited powers needed", "candidate"]),
            ("de_bonis_non", "De Bonis Non", "Further grant route where estate remains unadministered after prior representative.", ["prior grant", "unadministered estate", "successor"]),
            ("minor_incapacity", "Minor / Incapacity Route", "Applications involving minors, guardians or incapacity.", ["minor/incapacity status", "guardian", "benefit of person"]),
        ],
    ),
    (
        "caveats_citations",
        "Caveats, Warnings, Citations and Contentious Gateway",
        "Gateway from common-form registry work into contentious or direction-driven probate disputes.",
        [
            ("caveat_entry", "Caveat Entry", "Flags lodging of a caveat and its effect on grant progress.", ["caveator", "interest", "grant status"]),
            ("warning_appearance", "Warning and Appearance", "Routes warning to caveat and appearance to warning.", ["warning served", "appearance", "interest asserted"]),
            ("citation_accept_refuse_take_grant", "Citation to Accept / Refuse / Take Grant", "Citation route where an entitled person must decide whether to take a grant.", ["person cited", "entitlement", "service"]),
            ("citation_propound_will", "Citation to Propound Will", "Citation route to require propounding of a will.", ["will holder/proponent", "script", "interest"]),
        ],
    ),
    (
        "probate_action",
        "Probate Action / Solemn Form",
        "Contentious probate litigation layer for parties, scripts and solemn-form proof.",
        [
            ("parties_interest", "Parties and Interest", "Identifies proper parties and interest in a probate action.", ["claimant interest", "defendant interest", "grant/will challenged"]),
            ("testamentary_scripts", "Testamentary Scripts", "Tracks testamentary scripts and related disclosure/lodging obligations.", ["scripts", "custody", "witness evidence"]),
            ("solemn_form_proof", "Solemn-Form Proof / Trial", "Routes proof of will or challenge in contentious proceedings.", ["issue", "evidence", "trial directions"]),
        ],
    ),
    (
        "personal_representative_powers",
        "Personal Representative Powers",
        "Powers of personal representatives in claims, disposal and immovable property handling.",
        [
            ("rights_of_action", "Rights of Action", "Flags whether estate claims or causes of action vest in the representative.", ["cause of action", "grant", "capacity"]),
            ("disposal_charge_mortgage", "Disposal / Charge / Mortgage", "Routes powers to deal with estate property and security.", ["asset", "power relied on", "beneficiaries/creditors"]),
            ("conveyance_immovable", "Conveyance of Immovable Property", "Specific immovable-property administration/conveyance issue.", ["property", "title", "grant", "consents"]),
        ],
    ),
    (
        "fiduciary_duties",
        "Fiduciary Duties and Self-Dealing",
        "Conflict/self-dealing and appropriation review layer for representatives and beneficiaries.",
        [
            ("self_dealing_purchase", "Personal Representative Purchase / Self-Dealing", "Flags conflict risks where a representative purchases or benefits from estate property.", ["transaction", "representative role", "consent/order"]),
            ("appropriation_satisfaction", "Appropriation in Satisfaction of Entitlement", "Routes appropriation issues against entitlement or share.", ["asset", "beneficiary share", "valuation/consent"]),
        ],
    ),
    (
        "inventory_account_liability",
        "Inventory, Account, Protection and Liability",
        "Accountability and liability layer for representatives after grant.",
        [
            ("inventory_account", "Inventory and Account", "Tracks duty to produce inventory/account and related registry/court directions.", ["estate assets", "account period", "request/order"]),
            ("protection_on_grant", "Protection When Acting on Grant", "Flags protection for acts done under a grant pending revocation/variation issues.", ["grant status", "act done", "knowledge of defect"]),
            ("devastavit_waste_conversion", "Waste / Conversion / Devastavit", "Routes liability for misadministration or loss to estate.", ["act/omission", "loss", "representative conduct"]),
        ],
    ),
    (
        "debts_distribution",
        "Administration, Debts and Distribution",
        "Post-grant administration, debts, creditors, executor's year and distribution.",
        [
            ("debts_creditors", "Debts and Creditors", "Collects creditor and debt-administration issues.", ["creditors", "liabilities", "notices"]),
            ("retainer_preference", "Retainer / Preference", "Flags retainer or priority issues among debts/claims.", ["debt type", "representative position", "estate solvency"]),
            ("executor_year_distribution", "Executor's Year / Distribution Timing", "Routes timing and distribution review.", ["grant date", "assets realised", "known claims"]),
            ("residuary_accounts", "Residuary Accounts", "Tracks preparation and review of residuary accounts.", ["residue", "beneficiaries", "accounts"]),
        ],
    ),
    (
        "family_dependant_overlay",
        "Family / Dependant Claim Overlay",
        "Overlay for potential family/dependant provision claims interacting with probate administration.",
        [
            ("dependant_claim_flag", "Dependant / Family Claim Flag", "Flags possible dependant provision or family claim issues affecting distribution.", ["potential claimant", "relationship", "needs", "distribution status"]),
        ],
    ),
    (
        "registry_documents",
        "Registry Documents, Inspection and Copies",
        "Registry document, inspection, copy and requisition handling.",
        [
            ("inspection_copies", "Inspection and Copies", "Routes requests for inspection or copies of probate documents.", ["document sought", "interest", "registry status"]),
            ("registry_requisitions", "Registry Requisitions and Replies", "Tracks requisitions and required follow-up evidence.", ["requisition", "missing document", "reply evidence"]),
        ],
    ),
]


PROCEDURES: list[dict[str, Any]] = [
    {"id": "intake", "label": "Probate Intake and Matter Classification", "stage": "intake", "triggers": ["death", "estate", "probate", "administration"], "facts": ["deceased identity", "date of death", "domicile", "will status", "assets in Hong Kong"], "principles": ["probate_law_hk.jurisdiction_business.common_form", "probate_law_hk.grant_entitlement.probate_executor"], "forms": ["probate_form_intake_checklist"]},
    {"id": "death_domicile_capacity_check", "label": "Death, Domicile and Capacity Check", "stage": "intake", "triggers": ["death evidence", "domicile", "identity"], "facts": ["death certificate", "domicile", "identity documents"], "principles": ["probate_law_hk.will_validity_evidence.identity_handwriting_death"], "forms": ["probate_form_m_identity_death_evidence_alias"]},
    {"id": "will_status_review", "label": "Will Status and Testamentary Script Review", "stage": "intake", "triggers": ["will", "codicil", "testamentary script"], "facts": ["original will", "codicils", "condition", "custody history"], "principles": ["probate_law_hk.will_validity_evidence.due_execution", "probate_law_hk.probate_action.testamentary_scripts"], "forms": ["probate_form_w3_will_evidence_alias"]},
    {"id": "grant_type_selection", "label": "Grant Type Selection", "stage": "pre_application", "triggers": ["probate", "letters of administration", "will annexed", "intestacy"], "facts": ["executor position", "beneficiaries", "next of kin", "renunciations"], "principles": ["probate_law_hk.grant_entitlement.probate_executor", "probate_law_hk.grant_entitlement.intestate_administration"], "forms": ["probate_form_w1_probate_alias", "probate_form_l1_intestacy_alias"]},
    {"id": "entitlement_priority_check", "label": "Entitlement and Priority Check", "stage": "pre_application", "triggers": ["entitled", "priority", "administrator"], "facts": ["relationship", "priority class", "consents", "disputes"], "principles": ["probate_law_hk.grant_entitlement.intestate_administration", "probate_law_hk.grant_entitlement.additional_administrator"], "forms": ["probate_form_l3_nomination_coadmin_alias"]},
    {"id": "renunciation_or_consent", "label": "Renunciation / Consent Handling", "stage": "pre_application", "triggers": ["renunciation", "consent", "retraction"], "facts": ["renouncing person", "grant type", "consent status"], "principles": ["probate_law_hk.grant_entitlement.renunciation_retraction"], "forms": ["probate_form_w2_renunciation_alias", "probate_form_l2_renunciation_alias"]},
    {"id": "assets_liabilities_schedule", "label": "Assets and Liabilities Schedule", "stage": "pre_application", "triggers": ["assets", "liabilities", "schedule"], "facts": ["asset list", "liability list", "valuation", "Hong Kong assets"], "principles": ["probate_law_hk.assets_liabilities.schedule_assets_liabilities"], "forms": ["probate_form_n_schedule_alias"]},
    {"id": "surety_security_review", "label": "Surety / Security Review", "stage": "pre_application", "triggers": ["surety", "guarantee", "minor", "administrator"], "facts": ["grant type", "administrator identity", "minor/incapacity issue"], "principles": ["probate_law_hk.sureties_guarantees.surety_required"], "forms": ["probate_form_surety_review_note"]},
    {"id": "common_form_lodgement", "label": "Common-Form Grant Lodgement", "stage": "application", "triggers": ["probate application", "letters of administration"], "facts": ["application form", "supporting affidavit", "will/death evidence", "schedule"], "principles": ["probate_law_hk.jurisdiction_business.common_form"], "forms": ["probate_form_w1_probate_alias", "probate_form_l1_intestacy_alias"]},
    {"id": "registrar_requisition_response", "label": "Registrar Requisition Response", "stage": "application", "triggers": ["requisition", "further evidence", "registry"], "facts": ["requisition text", "missing evidence", "deadline"], "principles": ["probate_law_hk.registry_documents.registry_requisitions"], "forms": ["probate_form_requisition_reply_note"]},
    {"id": "summons_or_judge_route", "label": "Summons / Judge Route", "stage": "application", "triggers": ["summons", "judge", "Registrar direction"], "facts": ["order sought", "supporting affidavit", "service directions"], "principles": ["probate_law_hk.jurisdiction_business.judge_route"], "forms": ["probate_form_general_summons"]},
    {"id": "caveat_entry_warning", "label": "Caveat Entry and Warning", "stage": "contentious_gateway", "triggers": ["caveat", "warning"], "facts": ["caveator interest", "warning", "service"], "principles": ["probate_law_hk.caveats_citations.caveat_entry", "probate_law_hk.caveats_citations.warning_appearance"], "forms": ["probate_form_caveat_warning_alias"]},
    {"id": "appearance_to_warning", "label": "Appearance to Warning", "stage": "contentious_gateway", "triggers": ["appearance", "warning"], "facts": ["appearance", "interest", "time limit"], "principles": ["probate_law_hk.caveats_citations.warning_appearance"], "forms": ["probate_form_appearance_warning_note"]},
    {"id": "citation_route", "label": "Citation Route", "stage": "contentious_gateway", "triggers": ["citation", "propound", "take grant"], "facts": ["person cited", "interest", "script/grant issue"], "principles": ["probate_law_hk.caveats_citations.citation_accept_refuse_take_grant", "probate_law_hk.caveats_citations.citation_propound_will"], "forms": ["probate_form_citation_alias"]},
    {"id": "probate_action_commencement", "label": "Probate Action Commencement", "stage": "contentious", "triggers": ["probate action", "solemn form", "writ"], "facts": ["claimant interest", "defendants", "will/grant issue"], "principles": ["probate_law_hk.probate_action.parties_interest", "probate_law_hk.probate_action.solemn_form_proof"], "forms": ["probate_form_probate_action_note"]},
    {"id": "resealing_foreign_grant", "label": "Foreign Grant Resealing", "stage": "resealing", "triggers": ["foreign grant", "reseal", "domicile out of Hong Kong"], "facts": ["foreign grant", "country/place", "Hong Kong assets"], "principles": ["probate_law_hk.foreign_resealing.designated_route", "probate_law_hk.foreign_resealing.resealing_documents"], "forms": ["probate_form_resealing_checklist"]},
    {"id": "special_grant_application", "label": "Special Grant Application", "stage": "special_application", "triggers": ["pending suit", "ad colligenda bona", "de bonis non", "minor"], "facts": ["special grant type", "urgency", "estate need"], "principles": ["probate_law_hk.special_grants.pending_suit", "probate_law_hk.special_grants.ad_colligenda_bona"], "forms": ["probate_form_s_special_grant_alias"]},
    {"id": "lost_will_or_copy_will", "label": "Lost / Copy / Reconstructed Will Application", "stage": "special_application", "triggers": ["lost will", "copy will", "reconstructed will"], "facts": ["searches", "copy", "last custody", "consents"], "principles": ["probate_law_hk.will_validity_evidence.lost_copy_reconstructed"], "forms": ["probate_form_lost_will_alias"]},
    {"id": "leave_to_swear_death", "label": "Leave to Swear Death", "stage": "special_application", "triggers": ["leave to swear death", "accident", "ship", "aircraft"], "facts": ["circumstances", "corroboration", "foreign order"], "principles": ["probate_law_hk.will_validity_evidence.identity_handwriting_death"], "forms": ["probate_form_leave_swear_death_alias"]},
    {"id": "grant_issue_and_extraction", "label": "Grant Issue and Extraction", "stage": "grant", "triggers": ["grant issued", "extract grant"], "facts": ["grant type", "sealed grant", "conditions"], "principles": ["probate_law_hk.jurisdiction_business.common_form"], "forms": ["probate_form_grant_extraction_note"]},
    {"id": "amendment_or_revocation", "label": "Amendment or Revocation of Grant", "stage": "post_grant", "triggers": ["amend grant", "revoke grant", "later will"], "facts": ["existing grant", "error/new will", "consents", "order sought"], "principles": ["probate_law_hk.grant_entitlement.renunciation_retraction"], "forms": ["probate_form_amend_revocation_alias"]},
    {"id": "post_grant_administration", "label": "Post-Grant Administration", "stage": "post_grant", "triggers": ["administer estate", "debts", "distribution"], "facts": ["assets", "debts", "beneficiaries", "claims"], "principles": ["probate_law_hk.debts_distribution.debts_creditors", "probate_law_hk.debts_distribution.executor_year_distribution"], "forms": ["probate_form_post_grant_admin_note"]},
    {"id": "inventory_account_distribution", "label": "Inventory, Account and Distribution Review", "stage": "post_grant", "triggers": ["inventory", "account", "distribution"], "facts": ["inventory", "accounts", "beneficiary approvals", "claims"], "principles": ["probate_law_hk.inventory_account_liability.inventory_account", "probate_law_hk.debts_distribution.residuary_accounts"], "forms": ["probate_form_inventory_account_note"]},
]


FLOW_DEFS = [
    ("probate_common_form_grant_flow", "Common Form Grant Flow", ["intake", "death_domicile_capacity_check", "will_status_review", "grant_type_selection", "entitlement_priority_check", "renunciation_or_consent", "assets_liabilities_schedule", "surety_security_review", "common_form_lodgement", "registrar_requisition_response", "grant_issue_and_extraction"]),
    ("probate_caveat_warning_appearance_flow", "Caveat / Warning / Appearance Flow", ["intake", "caveat_entry_warning", "appearance_to_warning", "citation_route", "probate_action_commencement"]),
    ("probate_foreign_grant_resealing_flow", "Foreign Grant Resealing Flow", ["intake", "death_domicile_capacity_check", "resealing_foreign_grant", "assets_liabilities_schedule", "common_form_lodgement", "registrar_requisition_response", "grant_issue_and_extraction"]),
    ("probate_special_applications_flow", "Special Probate Applications Flow", ["intake", "summons_or_judge_route", "special_grant_application", "lost_will_or_copy_will", "leave_to_swear_death", "grant_issue_and_extraction"]),
    ("probate_post_grant_administration_flow", "Post-Grant Administration Flow", ["grant_issue_and_extraction", "amendment_or_revocation", "post_grant_administration", "inventory_account_distribution"]),
]


ALIAS_FORMS: list[dict[str, Any]] = [
    {"form_id": "probate_form_intake_checklist", "title": "Probate Intake Checklist", "family": "intake", "stage": "intake", "triggers": ["probate", "estate", "death"], "facts": ["deceased identity", "date of death", "will status", "asset overview"]},
    {"form_id": "probate_form_w1_probate_alias", "title": "W1 Probate / Administration With Will Annexed Form Family", "family": "grant_probate_testate", "stage": "common_form_grant", "triggers": ["executor", "probate", "will", "attorney of sole executor", "no executor appointed"], "facts": ["executor status", "will", "death evidence", "N2.1/N4.1 ordinary grant schedules"]},
    {"form_id": "probate_form_w1_1_named_executor_alias", "title": "W1.1a / W1.1b Ordinary Named Executor Application Family", "family": "grant_probate_named_executor", "stage": "common_form_grant", "triggers": ["ordinary named executor", "executor applies", "probate", "W1.1a", "W1.1b"], "facts": ["named executor", "original will", "death evidence", "N2.1 assets schedule", "N4.1 liabilities schedule"]},
    {"form_id": "probate_form_w1_2_attorney_sole_executor_alias", "title": "W1.2a / W1.2b Attorney of Sole Executor Application Family", "family": "grant_probate_attorney_of_sole_executor", "stage": "common_form_grant", "triggers": ["attorney of sole executor", "power of attorney", "sole executor", "W1.2a", "W1.2b"], "facts": ["sole executor identity", "attorney authority", "power of attorney", "original will", "death evidence", "N2.1/N4.1 schedules"]},
    {"form_id": "probate_form_w1_3_executor_died_or_renounced_alias", "title": "W1.3a / W1.3b Sole Executor Died or Renounced Family", "family": "grant_probate_executor_died_or_renounced", "stage": "common_form_grant", "triggers": ["sole executor died", "sole executor renounced", "administration with will annexed", "W1.3a", "W1.3b"], "facts": ["named executor status", "death or renunciation evidence", "person entitled to apply", "original will", "death evidence", "N2.1/N4.1 schedules"]},
    {"form_id": "probate_form_w1_4_no_executor_alias", "title": "W1.4a / W1.4b No Executor Appointed Family", "family": "grant_probate_no_executor_appointed", "stage": "common_form_grant", "triggers": ["no executor appointed", "will but no executor", "administration with will annexed", "W1.4a", "W1.4b"], "facts": ["will contains no executor appointment", "person entitled to apply", "original will", "death evidence", "N2.1/N4.1 schedules"]},
    {"form_id": "probate_form_w2_renunciation_alias", "title": "W2.1 / W2.2 Executor Renunciation Form Family", "family": "renunciation_executor_probate", "stage": "pre_application", "triggers": ["renunciation", "executor renounces probate", "W2.1", "W2.2"], "facts": ["renouncing executor", "will", "grant not already taken or retraction issue checked", "effect on remaining applicant"]},
    {"form_id": "probate_form_l1_intestacy_alias", "title": "L1 Intestate Administration Form Family", "family": "letters_administration_intestate", "stage": "common_form_grant", "triggers": ["intestacy", "letters of administration"], "facts": ["next of kin", "relationship", "death evidence", "assets schedule"]},
    {"form_id": "probate_form_l2_renunciation_alias", "title": "L2 Administration Renunciation Form Family", "family": "renunciation", "stage": "pre_application", "triggers": ["renunciation", "administration"], "facts": ["renouncing person", "priority", "grant status"]},
    {"form_id": "probate_form_l3_nomination_coadmin_alias", "title": "L3 Nomination / Power / Co-Administrator Form Family", "family": "additional_administrator", "stage": "pre_application", "triggers": ["nomination", "co-administrator", "guardian"], "facts": ["nominator", "proposed administrator", "authority"]},
    {"form_id": "probate_form_n_schedule_alias", "title": "N Schedule of Assets and Liabilities Form Family", "family": "assets_liabilities_schedule", "stage": "pre_application", "triggers": ["assets", "liabilities", "schedule", "ordinary grant", "corrective schedule"], "facts": ["asset list", "liability list", "valuation", "ordinary or corrective schedule route"]},
    {"form_id": "probate_form_n2_1_n4_1_ordinary_grant_schedule_alias", "title": "N2.1 + N4.1 Ordinary Grant Assets / Liabilities Schedule Family", "family": "ordinary_grant_assets_liabilities_schedule", "stage": "pre_application", "triggers": ["ordinary grant", "N2.1", "N4.1", "assets and liabilities"], "facts": ["asset list", "liability list", "valuation", "Hong Kong assets", "creditors", "ordinary grant application"]},
    {"form_id": "probate_form_n2_2_n2_3_n4_2_corrective_schedule_alias", "title": "N2.2 / N2.3 / N4.2 Corrective or Additional Schedule Family", "family": "corrective_or_additional_schedule", "stage": "pre_application", "triggers": ["corrective schedule", "additional schedule", "additional assets", "additional liabilities", "N2.2", "N2.3", "N4.2"], "facts": ["original schedule", "correction or additional item", "reason for change", "supporting valuation or creditor evidence"]},
    {"form_id": "probate_form_s_special_grant_alias", "title": "S Special Grant Form Family", "family": "special_grant", "stage": "special_application", "triggers": ["special grant", "pending suit", "ad colligenda bona"], "facts": ["special grant type", "urgency", "order sought"]},
    {"form_id": "probate_form_w3_will_evidence_alias", "title": "W3 Will Execution / Condition / Alteration Evidence Form Family", "family": "will_execution_condition_alteration_evidence", "stage": "evidence", "triggers": ["due execution issue", "attestation issue", "will condition", "plight", "alteration"], "facts": ["witness", "will condition", "execution facts", "alteration or plight issue"]},
    {"form_id": "probate_form_m_identity_death_evidence_alias", "title": "M Identity / Death Evidence Form Family", "family": "identity_death_evidence", "stage": "evidence", "triggers": ["identity", "death evidence"], "facts": ["identity issue", "death evidence", "corroboration"]},
    {"form_id": "probate_form_general_summons", "title": "General Probate Summons", "family": "general_summons", "stage": "summons_or_order", "triggers": ["summons", "order", "Registrar direction"], "facts": ["order sought", "respondents", "supporting affidavit"]},
    {"form_id": "probate_form_caveat_warning_alias", "title": "Caveat / Warning Form Candidate", "family": "caveat_warning", "stage": "contentious_gateway", "triggers": ["caveat", "warning"], "facts": ["caveator", "interest", "service"]},
    {"form_id": "probate_form_appearance_warning_note", "title": "Appearance to Warning Workpaper", "family": "caveat_warning", "stage": "contentious_gateway", "triggers": ["appearance", "warning"], "facts": ["appearance", "interest", "time limit"]},
    {"form_id": "probate_form_citation_alias", "title": "Citation Form Candidate", "family": "citation", "stage": "contentious_gateway", "triggers": ["citation", "propound", "take grant"], "facts": ["person cited", "interest", "service"]},
    {"form_id": "probate_form_probate_action_note", "title": "Probate Action / Solemn Form Workpaper", "family": "probate_action", "stage": "contentious", "triggers": ["probate action", "solemn form"], "facts": ["parties", "interest", "will/grant issue"]},
    {"form_id": "probate_form_resealing_checklist", "title": "Foreign Grant Resealing Checklist", "family": "foreign_resealing", "stage": "resealing", "triggers": ["foreign grant", "reseal"], "facts": ["foreign grant", "country/place", "Hong Kong assets"]},
    {"form_id": "probate_form_lost_will_alias", "title": "Lost / Copy / Reconstructed Will Form Family", "family": "lost_will", "stage": "special_application", "triggers": ["lost will", "copy will", "reconstructed will"], "facts": ["searches", "copy", "last custody", "consents"]},
    {"form_id": "probate_form_leave_swear_death_alias", "title": "Leave to Swear Death Form Family", "family": "leave_swear_death", "stage": "special_application", "triggers": ["leave to swear death", "accident", "ship", "aircraft"], "facts": ["circumstances", "corroboration", "foreign order"]},
    {"form_id": "probate_form_amend_revocation_alias", "title": "Amendment / Revocation of Grant Form Family", "family": "amend_revocation_grant", "stage": "post_grant", "triggers": ["amendment", "revocation", "later will"], "facts": ["existing grant", "error/new will", "consent"]},
    {"form_id": "probate_form_post_grant_admin_note", "title": "Post-Grant Administration Workpaper", "family": "post_grant_administration", "stage": "post_grant", "triggers": ["debts", "distribution", "administration"], "facts": ["assets", "debts", "beneficiaries", "claims"]},
    {"form_id": "probate_form_inventory_account_note", "title": "Inventory / Account / Distribution Workpaper", "family": "inventory_account", "stage": "post_grant", "triggers": ["inventory", "account", "distribution"], "facts": ["inventory", "account period", "beneficiary approval"]},
    {"form_id": "probate_form_requisition_reply_note", "title": "Probate Registry Requisition Reply Workpaper", "family": "registry_requisition", "stage": "application", "triggers": ["requisition", "further evidence"], "facts": ["requisition", "answer", "supporting evidence"]},
    {"form_id": "probate_form_surety_review_note", "title": "Surety / Security Review Workpaper", "family": "surety_security", "stage": "pre_application", "triggers": ["surety", "guarantee", "security"], "facts": ["grant type", "administrator identity", "minor/incapacity issue"]},
    {"form_id": "probate_form_grant_extraction_note", "title": "Grant Issue / Extraction Workpaper", "family": "grant_extraction", "stage": "grant", "triggers": ["grant issued", "extract grant"], "facts": ["grant type", "sealed grant", "conditions"]},
]


def slug(text: str) -> str:
    text = text.lower().replace("&", "and")
    text = re.sub(r"[^a-z0-9]+", "_", text)
    return re.sub(r"_+", "_", text).strip("_")


def sha256_path(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def zip_members(path: Path) -> list[zipfile.ZipInfo]:
    with zipfile.ZipFile(path) as zf:
        return [info for info in zf.infolist() if not info.is_dir() and info.filename.lower().endswith(".docx")]


def form_number(filename: str) -> str:
    match = re.search(r"FORM\s+NO\.\s*([A-Z]\d+(?:\.\d+)?[a-z]?)", filename, re.I)
    if match:
        return match.group(1).upper()
    match = re.match(r"(\d+(?:\.\d+)?)\s+", filename)
    if match:
        return match.group(1)
    if filename.startswith("1 SUMMONS"):
        return "1"
    return ""


def clean_title(filename: str) -> str:
    stem = Path(filename).stem
    stem = stem.replace("_", " ").replace("  ", " ")
    stem = re.sub(r"FORM\s+NO\.\s*", "Form ", stem, flags=re.I)
    stem = re.sub(r"\s+", " ", stem).strip()
    return stem


FORM_NUMBER_OVERRIDES: dict[str, tuple[str, str, list[str], list[str], list[str]]] = {
    "W1.1A": (
        "grant_probate_named_executor",
        "common_form_grant",
        ["ordinary named executor", "executor applies", "probate", "will", "W1.1a"],
        ["named executor", "original will", "death evidence", "N2.1 assets schedule", "N4.1 liabilities schedule"],
        ["probate_law_hk.grant_entitlement.probate_executor"],
    ),
    "W1.1B": (
        "grant_probate_named_executor",
        "common_form_grant",
        ["ordinary named executor", "executor applies", "probate", "will", "W1.1b"],
        ["named executor", "original will", "death evidence", "N2.1 assets schedule", "N4.1 liabilities schedule"],
        ["probate_law_hk.grant_entitlement.probate_executor"],
    ),
    "W1.2A": (
        "grant_probate_attorney_of_sole_executor",
        "common_form_grant",
        ["attorney of sole executor", "power of attorney", "sole executor", "probate", "W1.2a"],
        ["sole executor identity", "attorney authority", "power of attorney", "original will", "death evidence", "N2.1 assets schedule", "N4.1 liabilities schedule"],
        ["probate_law_hk.grant_entitlement.probate_executor"],
    ),
    "W1.2B": (
        "grant_probate_attorney_of_sole_executor",
        "common_form_grant",
        ["attorney of sole executor", "power of attorney", "sole executor", "probate", "W1.2b"],
        ["sole executor identity", "attorney authority", "power of attorney", "original will", "death evidence", "N2.1 assets schedule", "N4.1 liabilities schedule"],
        ["probate_law_hk.grant_entitlement.probate_executor"],
    ),
    "W1.3A": (
        "grant_probate_executor_died_or_renounced",
        "common_form_grant",
        ["sole executor died", "sole executor renounced", "executor unable to prove", "will annexed", "W1.3a"],
        ["named executor status", "death or renunciation evidence", "person entitled to apply", "original will", "death evidence", "N2.1 assets schedule", "N4.1 liabilities schedule"],
        ["probate_law_hk.grant_entitlement.admin_with_will_annexed", "probate_law_hk.grant_entitlement.renunciation_retraction"],
    ),
    "W1.3B": (
        "grant_probate_executor_died_or_renounced",
        "common_form_grant",
        ["sole executor died", "sole executor renounced", "executor unable to prove", "will annexed", "W1.3b"],
        ["named executor status", "death or renunciation evidence", "person entitled to apply", "original will", "death evidence", "N2.1 assets schedule", "N4.1 liabilities schedule"],
        ["probate_law_hk.grant_entitlement.admin_with_will_annexed", "probate_law_hk.grant_entitlement.renunciation_retraction"],
    ),
    "W1.4A": (
        "grant_probate_no_executor_appointed",
        "common_form_grant",
        ["no executor appointed", "will but no executor", "administration with will annexed", "W1.4a"],
        ["will contains no executor appointment", "person entitled to apply", "original will", "death evidence", "N2.1 assets schedule", "N4.1 liabilities schedule"],
        ["probate_law_hk.grant_entitlement.admin_with_will_annexed"],
    ),
    "W1.4B": (
        "grant_probate_no_executor_appointed",
        "common_form_grant",
        ["no executor appointed", "will but no executor", "administration with will annexed", "W1.4b"],
        ["will contains no executor appointment", "person entitled to apply", "original will", "death evidence", "N2.1 assets schedule", "N4.1 liabilities schedule"],
        ["probate_law_hk.grant_entitlement.admin_with_will_annexed"],
    ),
    "W2.1": (
        "renunciation_executor_probate",
        "pre_application",
        ["renunciation", "executor renounces probate", "W2.1"],
        ["renouncing executor", "will", "grant not already taken or retraction issue checked", "effect on remaining applicant"],
        ["probate_law_hk.grant_entitlement.renunciation_retraction"],
    ),
    "W2.2": (
        "renunciation_executor_probate",
        "pre_application",
        ["renunciation", "executor renounces probate", "W2.2"],
        ["renouncing executor", "will", "grant not already taken or retraction issue checked", "effect on remaining applicant"],
        ["probate_law_hk.grant_entitlement.renunciation_retraction"],
    ),
    "N2.1": (
        "ordinary_grant_assets_schedule",
        "pre_application",
        ["ordinary grant", "assets schedule", "N2.1", "probate", "letters of administration"],
        ["asset list", "Hong Kong assets", "valuation", "deceased ownership", "ordinary grant application"],
        ["probate_law_hk.assets_liabilities.schedule_assets_liabilities"],
    ),
    "N4.1": (
        "ordinary_grant_liabilities_schedule",
        "pre_application",
        ["ordinary grant", "liabilities schedule", "N4.1", "probate", "letters of administration"],
        ["liability list", "creditors", "amounts owed", "estate solvency", "ordinary grant application"],
        ["probate_law_hk.assets_liabilities.schedule_assets_liabilities", "probate_law_hk.debts_distribution.debts_creditors"],
    ),
    "N2.2": (
        "corrective_or_additional_assets_schedule",
        "pre_application",
        ["corrective schedule", "additional assets", "additional schedule", "N2.2"],
        ["original asset schedule", "correction or additional asset", "reason for change", "supporting valuation"],
        ["probate_law_hk.assets_liabilities.corrective_additional_schedule"],
    ),
    "N2.3": (
        "corrective_or_additional_assets_schedule",
        "pre_application",
        ["corrective schedule", "additional assets", "additional schedule", "N2.3"],
        ["original asset schedule", "correction or additional asset", "reason for change", "supporting valuation"],
        ["probate_law_hk.assets_liabilities.corrective_additional_schedule"],
    ),
    "N4.2": (
        "corrective_or_additional_liabilities_schedule",
        "pre_application",
        ["corrective schedule", "additional liabilities", "additional schedule", "N4.2"],
        ["original liability schedule", "correction or additional liability", "reason for change", "supporting creditor evidence"],
        ["probate_law_hk.assets_liabilities.corrective_additional_schedule", "probate_law_hk.debts_distribution.debts_creditors"],
    ),
}


def classify_form(filename: str) -> tuple[str, str, list[str], list[str], list[str]]:
    name = filename.lower()
    no = form_number(filename).upper()
    if no in FORM_NUMBER_OVERRIDES:
        return FORM_NUMBER_OVERRIDES[no]
    if no.startswith("W1"):
        return ("grant_probate_testate", "common_form_grant", ["executor", "probate", "will"], ["executor", "will", "death evidence", "assets schedule"], ["probate_law_hk.grant_entitlement.probate_executor"])
    if no.startswith("W2"):
        return ("renunciation", "pre_application", ["renunciation", "executor"], ["renouncing executor", "will", "grant status"], ["probate_law_hk.grant_entitlement.renunciation_retraction"])
    if no.startswith("L1"):
        return ("letters_administration_intestate", "common_form_grant", ["intestacy", "letters of administration"], ["next of kin", "relationship", "death evidence", "assets schedule"], ["probate_law_hk.grant_entitlement.intestate_administration"])
    if no.startswith("L2"):
        return ("renunciation", "pre_application", ["renunciation", "administration"], ["renouncing person", "priority", "grant status"], ["probate_law_hk.grant_entitlement.renunciation_retraction"])
    if no.startswith("L3"):
        return ("additional_administrator", "pre_application", ["nomination", "co-administrator", "guardian"], ["nominator/guardian", "proposed administrator", "authority"], ["probate_law_hk.grant_entitlement.additional_administrator"])
    if no.startswith("N"):
        return ("assets_liabilities_schedule", "pre_application", ["assets", "liabilities", "schedule"], ["asset list", "liability list", "valuation"], ["probate_law_hk.assets_liabilities.schedule_assets_liabilities"])
    if no.startswith("S"):
        return ("special_grant", "special_application", ["special grant", "pending suit", "limited grant"], ["special grant type", "urgency", "order sought"], ["probate_law_hk.special_grants.pending_suit"])
    if no.startswith("W3") or "witness to will" in name or "refusal of probate" in name:
        return ("will_execution_condition_alteration_evidence", "evidence", ["due execution issue", "attestation issue", "will condition", "alteration", "plight", "W3"], ["witness", "execution facts", "attestation facts", "will condition", "alteration or plight issue"], ["probate_law_hk.will_validity_evidence.due_execution", "probate_law_hk.will_validity_evidence.plight_condition_alterations"])
    if no.startswith("M"):
        return ("identity_death_evidence", "evidence", ["identity", "death evidence"], ["identity issue", "death evidence", "corroboration"], ["probate_law_hk.will_validity_evidence.identity_handwriting_death"])
    if "second administrator" in name or "additional administrator" in name:
        return ("additional_administrator", "pre_application", ["second administrator", "additional administrator"], ["proposed administrator", "priority", "consent/order"], ["probate_law_hk.grant_entitlement.additional_administrator"])
    if "equally entitled" in name:
        return ("equally_entitled_persons_dispute", "contentious_gateway", ["equally entitled", "dispute", "grant"], ["competing applicants", "priority", "affidavit evidence"], ["probate_law_hk.grant_entitlement.intestate_administration"])
    if "minor" in name or "guardian" in name:
        return ("minor_incapacity", "special_application", ["minor", "guardian", "incapacity"], ["minor/incapacity status", "guardian", "benefit"], ["probate_law_hk.special_grants.minor_incapacity"])
    if "retract renunciation" in name:
        return ("renunciation", "pre_application", ["retract renunciation", "renunciation"], ["renunciation", "reason", "affected persons"], ["probate_law_hk.grant_entitlement.renunciation_retraction"])
    if "bachelor" in name or "child for grant" in name:
        return ("letters_administration_intestate", "common_form_grant", ["child", "bachelor", "intestacy"], ["relationship", "priority", "death evidence"], ["probate_law_hk.grant_entitlement.intestate_administration"])
    if "amendment" in name or "revocation" in name:
        return ("amend_revocation_grant", "post_grant", ["amendment", "revocation", "grant"], ["existing grant", "error/new will", "consent/order"], ["probate_law_hk.grant_entitlement.renunciation_retraction"])
    if "testamentary document" in name or "subpoena" in name:
        return ("bring_in_testamentary_document", "contentious_gateway", ["testamentary document", "subpoena"], ["document holder", "script", "service"], ["probate_law_hk.probate_action.testamentary_scripts"])
    if "leave to swear death" in name:
        return ("leave_swear_death", "special_application", ["leave to swear death", "accident", "foreign order"], ["circumstances", "corroboration", "death evidence"], ["probate_law_hk.will_validity_evidence.identity_handwriting_death"])
    if "lost will" in name or "copy or reconstruction" in name:
        return ("lost_will", "special_application", ["lost will", "copy will", "reconstruction"], ["searches", "copy/reconstruction", "consents"], ["probate_law_hk.will_validity_evidence.lost_copy_reconstructed"])
    if "nuncupative" in name:
        return ("nuncupative_privileged_will", "special_application", ["nuncupative will", "oral will"], ["circumstances", "witnesses", "corroboration"], ["probate_law_hk.will_validity_evidence.nuncupative_privileged"])
    if "rectification" in name:
        return ("rectification_will", "special_application", ["rectification", "clerical error", "instructions"], ["error", "instructions", "drafting evidence"], ["probate_law_hk.will_validity_evidence.rectification"])
    if "summons" in name:
        return ("general_summons", "summons_or_order", ["summons", "order"], ["order sought", "respondents", "supporting affidavit"], ["probate_law_hk.jurisdiction_business.judge_route"])
    return ("probate_form_metadata", "uncategorised_metadata", ["probate"], ["parties", "grant type", "supporting facts"], ["probate_law_hk.jurisdiction_business.common_form"])


def make_principle_nodes() -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    nodes: list[dict[str, Any]] = [
        {
            "id": "probate_principles_root",
            "doctrine_node_id": "probate_law_hk",
            "type": "section_header",
            "label": "Hong Kong Probate Principles",
            "summary": "Metadata-only Probate principle map separating jurisdiction, grant entitlement, will evidence, contentious gateways, personal representative powers and post-grant administration.",
            "section": "01",
            **COMMON_NODE_STATUS,
        }
    ]
    edges: list[dict[str, str]] = []
    for group_id, label, summary, children in PRINCIPLE_GROUPS:
        group_node_id = f"probate_{group_id}"
        group_doctrine_id = f"probate_law_hk.{group_id}"
        nodes.append(
            {
                "id": group_node_id,
                "doctrine_node_id": group_doctrine_id,
                "type": "legal_issue",
                "label": label,
                "summary": summary,
                "section": "01",
                "subsection": f"01.{len([n for n in nodes if n.get('type') == 'legal_issue']) + 1:02d}",
                "subtopic": label,
                "probate_answer_part": "principles",
                "probate_principle_group": group_id,
                "required_facts": [],
                "search_terms": label.lower().split(),
                **COMMON_NODE_STATUS,
            }
        )
        edges.append({"from": "probate_principles_root", "to": group_node_id, "relationship": "contains"})
        for child_id, child_label, child_summary, facts in children:
            node_id = f"probate_{group_id}_{child_id}"
            doctrine_id = f"probate_law_hk.{group_id}.{child_id}"
            nodes.append(
                {
                    "id": node_id,
                    "doctrine_node_id": doctrine_id,
                    "type": "legal_issue",
                    "label": child_label,
                    "summary": child_summary,
                    "section": "01",
                    "subsection": f"01.{group_id}",
                    "subtopic": label,
                    "probate_answer_part": "principles",
                    "probate_principle_group": group_id,
                    "required_facts": facts,
                    "linked_procedure_nodes": [],
                    "search_terms": list(dict.fromkeys(label.lower().split() + child_label.lower().split())),
                    **COMMON_NODE_STATUS,
                }
            )
            edges.append({"from": group_node_id, "to": node_id, "relationship": "principle_child"})
    return nodes, edges


def make_procedure_nodes() -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    nodes: list[dict[str, Any]] = [
        {
            "id": "probate_procedure_root",
            "doctrine_node_id": "probate_law_hk.procedure",
            "type": "section_header",
            "label": "Probate Procedures and Forms",
            "summary": "Action layer for common-form grants, caveats, citations, resealing, special applications and post-grant administration. Form links are metadata-only.",
            "section": "02",
            **COMMON_NODE_STATUS,
        }
    ]
    edges: list[dict[str, str]] = []
    for idx, step in enumerate(PROCEDURES, 1):
        node_id = f"probate_procedure.{step['id']}"
        nodes.append(
            {
                "id": node_id,
                "doctrine_node_id": f"probate_law_hk.procedure.{step['id']}",
                "type": "flow_step",
                "label": step["label"],
                "summary": f"{step['label']} step for Probate workflow. Output remains draft-only and lawyer-review-required.",
                "section": "02",
                "subsection": f"02.{idx:02d}",
                "procedure_stage": step["stage"],
                "trigger_conditions": step["triggers"],
                "required_facts": step["facts"],
                "linked_principle_nodes": step["principles"],
                "linked_forms": step["forms"],
                "next_steps": [],
                "review_status": "machine_extracted_candidate",
                "output_mode": "draft_only_lawyer_review_required",
                **COMMON_NODE_STATUS,
            }
        )
        edges.append({"from": "probate_procedure_root", "to": node_id, "relationship": "procedure_step"})
    proc_ids = {p["id"]: f"probate_procedure.{p['id']}" for p in PROCEDURES}
    for _, _, steps in FLOW_DEFS:
        for a, b in zip(steps, steps[1:]):
            edges.append({"from": proc_ids[a], "to": proc_ids[b], "relationship": "flow_transition"})
    return nodes, edges


def make_forms() -> list[dict[str, Any]]:
    forms: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    with zipfile.ZipFile(PROBATE_FORMS_ZIP) as zf:
        for idx, info in enumerate([i for i in zf.infolist() if not i.is_dir() and i.filename.lower().endswith(".docx")], 1):
            data = zf.read(info)
            family, stage, triggers, facts, linked = classify_form(info.filename)
            no = form_number(info.filename)
            stable = slug(no or Path(info.filename).stem)
            if not stable:
                stable = f"form_{idx:03d}"
            form_id = f"probate_form_{stable}"
            if form_id in seen_ids:
                form_id = f"{form_id}_{idx:03d}"
            seen_ids.add(form_id)
            forms.append(
                {
                    "form_id": form_id,
                    "title": clean_title(info.filename),
                    "form_number": no,
                    "form_family": family,
                    "document_type": "probate_form_or_supporting_document",
                    "procedural_stage": stage,
                    "source_filename": info.filename,
                    "source_hash": hashlib.sha256(data).hexdigest(),
                    "trigger_conditions": triggers,
                    "required_facts": facts,
                    "linked_principle_nodes": linked,
                    "linked_procedure_steps": [f"probate_procedure.{p['id']}" for p in PROCEDURES if any(f in p["forms"] for f in [form_id])],
                    "field_schema": [],
                    **COMMON_FORM_STATUS,
                }
            )
            forms[-1]["field_schema"] = [
                {"field_id": slug(fact), "label": fact, "required": True, "source": "filename_inferred_metadata"}
                for fact in facts
            ]
    forms.extend(
        {
            "form_id": item["form_id"],
            "title": item["title"],
            "form_family": item["family"],
            "document_type": "metadata_only_form_family_alias",
            "procedural_stage": item["stage"],
            "source_filename": "generated_alias_from_uploaded_probate_form_bank",
            "source_hash": "",
            "trigger_conditions": item["triggers"],
            "required_facts": item["facts"],
            "linked_principle_nodes": [],
            "linked_procedure_steps": [f"probate_procedure.{p['id']}" for p in PROCEDURES if item["form_id"] in p["forms"]],
            "field_schema": [
                {"field_id": slug(fact), "label": fact, "required": True, "source": "practice_seed_metadata"}
                for fact in item["facts"]
            ],
            **COMMON_FORM_STATUS,
        }
        for item in ALIAS_FORMS
    )
    return forms


def make_flows() -> list[dict[str, Any]]:
    return [
        {
            "flow_id": flow_id,
            "title": title,
            "description": f"{title} for Hong Kong Probate. Metadata-only, draft-only and lawyer-review-required.",
            "steps": [f"probate_procedure.{step}" for step in steps],
            "review_status": "machine_extracted_candidate",
            "output_mode": "draft_only_lawyer_review_required",
        }
        for flow_id, title, steps in FLOW_DEFS
    ]


def make_answer_contracts() -> list[dict[str, Any]]:
    base_sections = ["Short Answer", "Applied Analysis", "Practical Steps", "Documents / Forms", "Missing Facts", "Source / Audit Trail"]
    return [
        {
            "contract_id": "probate_contract_common_form_grant",
            "domain": "probate_law_hk",
            "scenario_family": "common_form_grant",
            "scenario_subtype": "probate_or_administration_application",
            "user_perspective": "applicant_or_adviser",
            "procedural_posture": "pre_grant",
            "primary_issues": ["grant_type", "entitlement", "will_or_intestacy", "assets_liabilities", "registry_requisition"],
            "excluded_issues": ["contentious_probate_unless_dispute", "private_book_text"],
            "answer_sections": base_sections,
            "required_next_steps": ["classify grant", "collect death/will/evidence", "prepare metadata-only form candidates", "lawyer review"],
            "required_missing_facts": ["deceased identity", "date of death", "will status", "executor/next of kin", "assets and liabilities"],
            "verification_rule": "No source card means source-verification-required. Forms are metadata-only candidates.",
            "source_audit_policy": "collapsed_by_default",
            "review_status": "research_only",
        },
        {
            "contract_id": "probate_contract_caveat_contentious_gateway",
            "domain": "probate_law_hk",
            "scenario_family": "caveat_warning_citation",
            "scenario_subtype": "caveat_warning_appearance_or_citation",
            "user_perspective": "caveator_applicant_or_adviser",
            "procedural_posture": "contentious_gateway",
            "primary_issues": ["interest", "caveat", "warning", "appearance", "citation", "probate_action_risk"],
            "excluded_issues": ["routine_common_form_only", "private_book_text"],
            "answer_sections": base_sections,
            "required_next_steps": ["identify interest", "check caveat/warning status", "preserve testamentary scripts", "consider probate action route"],
            "required_missing_facts": ["grant status", "caveat date", "warning/appearance status", "interest claimed", "will/grant disputed"],
            "verification_rule": "Contentious route must stay research-only until rules/source cards are verified.",
            "source_audit_policy": "collapsed_by_default",
            "review_status": "research_only",
        },
        {
            "contract_id": "probate_contract_resealing_foreign_grant",
            "domain": "probate_law_hk",
            "scenario_family": "foreign_grant_resealing",
            "scenario_subtype": "resealing_or_foreign_estate",
            "user_perspective": "foreign_personal_representative_or_adviser",
            "procedural_posture": "pre_resealing",
            "primary_issues": ["foreign_grant", "designated_place", "Hong Kong assets", "corrections", "registry_documents"],
            "excluded_issues": ["Hong_Kong_original_grant_only", "private_book_text"],
            "answer_sections": base_sections,
            "required_next_steps": ["identify foreign grant", "check resealing route", "collect Hong Kong asset evidence", "prepare metadata form candidates"],
            "required_missing_facts": ["issuing jurisdiction", "foreign grant", "Hong Kong assets", "domicile", "translation/certification"],
            "verification_rule": "Resealing must be verified against current ordinance/rules before answer-safe output.",
            "source_audit_policy": "collapsed_by_default",
            "review_status": "research_only",
        },
        {
            "contract_id": "probate_contract_post_grant_administration",
            "domain": "probate_law_hk",
            "scenario_family": "post_grant_administration",
            "scenario_subtype": "inventory_account_debts_distribution",
            "user_perspective": "personal_representative_beneficiary_or_adviser",
            "procedural_posture": "post_grant",
            "primary_issues": ["personal_representative_powers", "fiduciary_duties", "inventory_account", "debts", "distribution"],
            "excluded_issues": ["pre_grant_form_selection_only", "private_book_text"],
            "answer_sections": base_sections,
            "required_next_steps": ["verify grant", "collect estate account", "identify debts/claims", "review distribution timing"],
            "required_missing_facts": ["grant date", "assets realised", "debts/claims", "beneficiaries", "accounts"],
            "verification_rule": "Post-grant duties require official/source-card verification before final legal propositions.",
            "source_audit_policy": "collapsed_by_default",
            "review_status": "research_only",
        },
    ]


def make_rag_index(nodes: list[dict[str, Any]], procedures: list[dict[str, Any]], forms: list[dict[str, Any]], contracts: list[dict[str, Any]]) -> dict[str, Any]:
    chunks = []

    def add(layer: str, chunk_id: str, title: str, quote: str, metadata: dict[str, Any]) -> None:
        tokens: dict[str, int] = {}
        text = " ".join([chunk_id, layer, title, quote, json.dumps(metadata, ensure_ascii=False)])
        for token in re.findall(r"[a-z0-9]+", text.lower()):
            if len(token) >= 2:
                tokens[token] = tokens.get(token, 0) + 1
        chunks.append(
            {
                "chunk_id": chunk_id,
                "layer": layer,
                "title": title,
                "source_file": metadata.get("source_file", ""),
                "citation": "licensed_private_metadata_seed",
                "pinpoint": metadata.get("pinpoint", ""),
                "quote": quote,
                "metadata": metadata,
                "review_status": metadata.get("review_status", "unreviewed"),
                "output_mode": metadata.get("output_mode", "draft_only_lawyer_review_required"),
                "tokens": tokens,
            }
        )

    for node in nodes:
        if node["type"] != "section_header":
            add("principles", node["doctrine_node_id"], node["label"], node["summary"], {"source_file": "nodes/01_probate_principles.json", "required_facts": node.get("required_facts", []), "review_status": node.get("human_review_status", "unreviewed")})
    for proc in procedures:
        add("procedures_forms", proc["doctrine_node_id"], proc["label"], proc["summary"], {"source_file": "nodes/02_probate_procedures.json", "required_facts": proc.get("required_facts", []), "linked_forms": proc.get("linked_forms", []), "review_status": proc.get("review_status", "machine_extracted_candidate")})
    for form in forms:
        add("forms", form["form_id"], form["title"], "Metadata-only Probate form candidate; no proprietary wording reproduced.", {"source_file": "probate_form_registry.json", "trigger_conditions": form.get("trigger_conditions", []), "required_facts": form.get("required_facts", []), "review_status": form.get("review_status", "machine_extracted_candidate")})
    for contract in contracts:
        add("answer_contracts", contract["contract_id"], contract["scenario_family"], contract["verification_rule"], {"source_file": "probate_answer_contracts.json", "required_missing_facts": contract.get("required_missing_facts", []), "review_status": contract.get("review_status", "research_only")})
    return {
        "domain_id": "probate_law_hk",
        "version": "0.1.0",
        "status": "metadata_only_research_layer",
        "chunks": chunks,
        "safety": {
            "raw_book_text_committed": False,
            "raw_form_text_committed": False,
            "answer_safe_cards": 0,
            "source_verification_required": True,
        },
    }


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def build() -> None:
    if not PROBATE_FORMS_ZIP.exists():
        raise FileNotFoundError(PROBATE_FORMS_ZIP)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    (DATA_DIR / "nodes").mkdir(exist_ok=True)
    (DATA_DIR / "edges").mkdir(exist_ok=True)

    principle_nodes, principle_edges = make_principle_nodes()
    procedure_nodes, procedure_edges = make_procedure_nodes()
    forms = make_forms()
    flows = make_flows()
    contracts = make_answer_contracts()
    all_edges = principle_edges + procedure_edges
    form_ids = {f["form_id"] for f in forms}
    node_ids = {n["id"] for n in principle_nodes + procedure_nodes}

    source_registry = {
        "source_registry": [
            {
                "source_id": "probate_private_butterworths_pat_p252_502",
                "source_type": "licensed_book",
                "title": "Butterworths Hong Kong Probate, Administration & Trustee excerpt p252-502",
                "source_filename": BUTTERWORTHS_PDF.name,
                "source_hash": sha256_path(BUTTERWORTHS_PDF) if BUTTERWORTHS_PDF.exists() else "",
                "license_status": "licensed_private",
                "storage_policy": "private_vault_only",
                "visibility": "licensed_private",
                "review_status": "lawyer_review_required",
                "answer_layer_status": "research_only",
                "public_output": {"metadata_only": True, "raw_text_emitted": False},
            },
            {
                "source_id": "probate_private_forms_zip",
                "source_type": "firm_precedent",
                "title": "Uploaded Probate form bank",
                "source_filename": PROBATE_FORMS_ZIP.name,
                "source_hash": sha256_path(PROBATE_FORMS_ZIP),
                "license_status": "firm_private",
                "storage_policy": "private_vault_only",
                "visibility": "firm_private",
                "review_status": "lawyer_review_required",
                "answer_layer_status": "research_only",
                "public_output": {"metadata_only": True, "raw_text_emitted": False},
            },
            {
                "source_id": "probate_private_practice_zip",
                "source_type": "licensed_book",
                "title": "Uploaded Probate practice notes ZIP",
                "source_filename": PROBATE_PRACTICE_ZIP.name,
                "source_hash": sha256_path(PROBATE_PRACTICE_ZIP) if PROBATE_PRACTICE_ZIP.exists() else "",
                "license_status": "licensed_private",
                "storage_policy": "private_vault_only",
                "visibility": "licensed_private",
                "review_status": "lawyer_review_required",
                "answer_layer_status": "research_only",
                "public_output": {"metadata_only": True, "raw_text_emitted": False},
            },
        ]
    }

    write_json(DATA_DIR / "nodes" / "01_probate_principles.json", {"section_id": "01", "section_title": "Probate Principles", "domain_id": "probate_law_hk", "nodes": principle_nodes})
    write_json(DATA_DIR / "nodes" / "02_probate_procedures.json", {"section_id": "02", "section_title": "Probate Procedures and Forms", "domain_id": "probate_law_hk", "nodes": procedure_nodes})
    write_json(DATA_DIR / "edges" / "01_probate_edges.json", {"domain_id": "probate_law_hk", "edges": principle_edges})
    write_json(DATA_DIR / "edges" / "02_probate_procedure_edges.json", {"domain_id": "probate_law_hk", "edges": procedure_edges})
    write_json(DATA_DIR / "flows.json", {"domain_id": "probate_law_hk", "flows": flows})
    write_json(DATA_DIR / "probate_procedure_flows.json", {"domain_id": "probate_law_hk", "flows": flows})
    write_json(DATA_DIR / "probate_form_registry.json", {"domain_id": "probate_law_hk", "forms": forms})
    write_json(DATA_DIR / "probate_answer_contracts.json", {"domain_id": "probate_law_hk", "answer_contracts": contracts})
    write_json(DATA_DIR / "probate_source_registry.json", {"domain_id": "probate_law_hk", **source_registry})
    write_json(DATA_DIR / "probate_rag_index.json", make_rag_index(principle_nodes, procedure_nodes, forms, contracts))

    consolidated = {
        "domain_id": "probate_law_hk",
        "title": "Hong Kong Probate Law",
        "version": "0.1.0",
        "last_updated": "2026-06-16",
        "status": STATUS,
        "sections": [
            {"id": "01", "title": "Probate Principles", "node_file": "nodes/01_probate_principles.json", "edge_file": "edges/01_probate_edges.json"},
            {"id": "02", "title": "Probate Procedures and Forms", "node_file": "nodes/02_probate_procedures.json", "edge_file": "edges/02_probate_procedure_edges.json"},
        ],
        "flows_file": "flows.json",
        "specialist_flows": ["probate_procedure_flows.json"],
        "form_registries": ["probate_form_registry.json"],
        "answer_contracts": ["probate_answer_contracts.json"],
        "source_registries": ["probate_source_registry.json"],
        "rag_indexes": ["probate_rag_index.json"],
        "answer_parts": [
            {"id": "principles", "label": "Principles", "source": "nodes/01_probate_principles.json"},
            {"id": "procedures", "label": "Procedures / Forms", "source": "nodes/02_probate_procedures.json"},
        ],
        "counts": {
            "principle_nodes": len(principle_nodes),
            "procedure_nodes": len(procedure_nodes),
            "forms": len(forms),
            "edges": len(all_edges),
            "flows": len(flows),
        },
    }
    write_json(DATA_DIR / "consolidated.json", consolidated)
    write_json(
        DATA_DIR / "domain.json",
        {
            "domain_id": "probate_law_hk",
            "title": "Hong Kong Probate Law",
            "description": "Metadata-only Hong Kong Probate map covering common-form grants, contentious probate gateways, resealing, special grants, personal representative powers and post-grant administration.",
            "legal_family": "common_law_private_law",
            "sub_family": "probate_estates_administration",
            "source_priority": "ordinance_rules_judiciary_registry_first_then_private_licensed_material",
            "intended_use": "Structured Probate knowledge graph and form-routing seed. Not legal advice and not an answer-safe law layer.",
            "status": STATUS,
            "utterance_disclaimer": "This Probate pack is a metadata/practice seed. It does not reproduce Butterworths text or private precedent wording. Verify all propositions against official source cards before reliance.",
            "node_type_colors": {
                "domain": "#1a1a2e",
                "section_header": "#2d4059",
                "legal_issue": "#2266cc",
                "flow_step": "#d97706",
                "candidate_evidence": "#64748b",
            },
            "sections": [
                {"id": "01", "title": "Probate Principles", "file": "nodes/01_probate_principles.json"},
                {"id": "02", "title": "Probate Procedures and Forms", "file": "nodes/02_probate_procedures.json"},
            ],
        },
    )
    (DATA_DIR / "README.md").write_text(
        "# Hong Kong Probate Law Domain Pack\n\n"
        "Metadata-only Probate principles, procedure flows, form registry and answer-contract seeds.\n\n"
        "This pack intentionally does not commit raw Butterworths text or private form wording. "
        "All Probate nodes and forms are research-layer seeds pending official source-card and lawyer review.\n\n"
        f"Generated counts: {len(principle_nodes)} principle nodes, {len(procedure_nodes)} procedure nodes, "
        f"{len(forms)} form metadata records, {len(all_edges)} edges, {len(flows)} flows.\n",
        encoding="utf-8",
    )
    (ROOT / "CODEX_PROBATE_NEXT_STEPS.md").write_text(
        "# Probate Next Steps\n\n"
        "1. Ingest official Probate and Administration Ordinance, Non-Contentious Probate Rules, Wills Ordinance and Judiciary/Probate Registry guidance as source cards.\n"
        "2. Keep Butterworths and form precedent bodies private-vault-only.\n"
        "3. Promote Probate propositions only after quote-level source verification and lawyer review.\n"
        "4. Extend the Probate answer composer with live source-card retrieval when Supabase legal-ingest is configured.\n"
        "5. Add official-form/template assembly only after form schemas and permissions are reviewed.\n",
        encoding="utf-8",
    )

    unresolved_forms = sorted({form for node in procedure_nodes for form in node.get("linked_forms", []) if form not in form_ids})
    unresolved_edges = [edge for edge in all_edges if edge["from"] not in node_ids or edge["to"] not in node_ids]
    if unresolved_forms:
        raise RuntimeError(f"Procedure nodes reference missing forms: {unresolved_forms[:10]}")
    if unresolved_edges:
        raise RuntimeError(f"Unresolved graph edges: {unresolved_edges[:5]}")


if __name__ == "__main__":
    build()
