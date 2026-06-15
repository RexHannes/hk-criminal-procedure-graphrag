"""Typed helpers for Phase 1 legal ingestion objects."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class SourceRegistryRecord:
    source_id: str
    source_type: str
    title: str
    jurisdiction: str
    license_status: str
    storage_policy: str
    checksum: str
    ingest_status: str = "registered"
    review_status: str = "unreviewed"
    visibility: str = "public_metadata"


@dataclass(frozen=True)
class LegalParagraphCard:
    paragraph_id: str
    source_id: str
    para_no: str
    paragraph_text: str
    citation: str
    jurisdiction: str = "Hong Kong"
    issue_tags: list[str] = field(default_factory=list)
    verification_status: str = "machine_candidate"
    answer_layer_status: str = "research_only"


@dataclass(frozen=True)
class PropositionCard:
    proposition_id: str
    source_id: str
    proposition_text: str
    supporting_quote: str
    issue_tags: list[str]
    jurisdiction: str
    authority_role: str
    verification_status: str = "machine_candidate"
    answer_layer_status: str = "research_only"
    review_status: str = "unreviewed"


@dataclass(frozen=True)
class FormMetadataRecord:
    form_id: str
    title: str
    form_family: str
    document_type: str
    trigger_conditions: list[str]
    required_facts: list[str]
    linked_issues: list[str]
    linked_procedure_steps: list[str]
    source_status: str = "metadata_only"
    copyright_status: str = "metadata_only_no_full_text_reproduced"
    review_status: str = "machine_extracted_candidate"
    output_mode: str = "draft_only_lawyer_review_required"

