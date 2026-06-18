#!/usr/bin/env python3
"""Validate production storage/review wiring without requiring credentials."""

from __future__ import annotations

import ast
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ENV_EXAMPLE = ROOT / ".env.example"
STORAGE_ADAPTER = ROOT / "legal-ingest-service" / "storage_adapters" / "legal_storage.py"
APP_MAIN = ROOT / "legal-ingest-service" / "app" / "main.py"
REVIEW_QUEUE = ROOT / "api" / "legal-ingest" / "review-queue.js"
APPROVE_ENDPOINT = ROOT / "api" / "legal-ingest" / "review" / "[card_id]" / "approve.js"
BUCKET_MIGRATION = ROOT / "supabase" / "migrations" / "20260611001000_create_legal_storage_buckets.sql"
REMOTE_SETUP_SCRIPT = ROOT / "scripts" / "setup_supabase_legal_ingest.js"
PIPELINE_RUNNER = ROOT / "scripts" / "run_legal_rag_pipeline.js"
QDRANT_QUERY = ROOT / "scripts" / "query_legal_qdrant.js"
QDRANT_RETRIEVER = ROOT / "src" / "legal_answer" / "qdrant_retriever.js"
QDRANT_RETRIEVAL_SMOKE = ROOT / "scripts" / "validate_qdrant_retrieval_smoke.js"
STUDENT_PACK_MAP = ROOT / "data" / "legal_ingest" / "mvp" / "github_student_pack_services.json"
STUDENT_PACK_VALIDATOR = ROOT / "scripts" / "validate_student_pack_services.js"
SOURCE_GATED_DOC = ROOT / "docs" / "source-gated-legal-answer-engine.md"
LEGAL_ANSWER_SCHEMA = ROOT / "src" / "legal_answer" / "schema.js"
EVIDENCE_PACK_SMOKE = ROOT / "scripts" / "build_legal_evidence_pack_smoke.js"
SOURCE_GATED_VALIDATOR = ROOT / "scripts" / "validate_source_gated_answer.js"
GOLDEN_QUERY_VALIDATOR = ROOT / "scripts" / "validate_legal_golden_queries.js"


def main() -> int:
    errors: list[str] = []

    for path in [STORAGE_ADAPTER, APP_MAIN]:
        try:
            ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        except SyntaxError as exc:
            errors.append(f"{path}: syntax error {exc}")

    env = ENV_EXAMPLE.read_text(encoding="utf-8")
    for key in [
        "LEGAL_STORAGE_BACKEND",
        "LEGAL_PRIVATE_BUCKET",
        "LEGAL_PUBLIC_BUCKET",
        "LEGAL_PARSED_BUCKET",
        "LEGAL_REVIEW_ADMIN_TOKEN",
        "QDRANT_URL",
        "QDRANT_COLLECTION_PROPOSITIONS",
        "LLM_PROVIDER",
        "ANTHROPIC_API_KEY",
        "OPENAI_API_KEY",
        "LLM_LOCAL_ENDPOINT",
    ]:
        if f"{key}=" not in env:
            errors.append(f".env.example missing {key}")

    adapter = STORAGE_ADAPTER.read_text(encoding="utf-8")
    if "LEGAL_STORAGE_BACKEND" not in adapter or "SupabaseStorageBackend" not in adapter:
        errors.append("storage adapter missing Supabase backend selection")
    if "/storage/v1/object/" not in adapter:
        errors.append("storage adapter does not target Supabase Storage object API")
    if "/rest/v1/" not in adapter:
        errors.append("registry adapter does not target Supabase REST API")

    app = APP_MAIN.read_text(encoding="utf-8")
    if "configured_backends()" not in app:
        errors.append("FastAPI app is not using configured storage/registry backends")
    if "may_store_raw" not in app:
        errors.append("FastAPI app must consult source policy before storing raw bytes")

    for endpoint in [REVIEW_QUEUE, APPROVE_ENDPOINT]:
        if not endpoint.exists():
            errors.append(f"missing endpoint {endpoint}")
    review_queue = REVIEW_QUEUE.read_text(encoding="utf-8")
    if "supabase_query_failed_fallback_local" not in review_queue:
        errors.append("review queue should fallback to local JSON when Supabase tables are not deployed")
    approve = APPROVE_ENDPOINT.read_text(encoding="utf-8")
    if "LEGAL_REVIEW_ADMIN_TOKEN" not in (ROOT / "api" / "legal-ingest" / "_utils.js").read_text(encoding="utf-8"):
        errors.append("review admin token guard missing")
    if "promote_answer_safe" not in approve:
        errors.append("approval endpoint must make answer_safe promotion explicit")
    if "supabase_not_configured" not in approve:
        errors.append("approval endpoint should fail closed unless Supabase is configured")

    migration = BUCKET_MIGRATION.read_text(encoding="utf-8")
    for bucket in ["legal-private-vault", "legal-public-sources", "legal-parsed-artifacts"]:
        if bucket not in migration:
            errors.append(f"bucket migration missing {bucket}")
    if "public, file_size_limit" not in migration or "false" not in migration:
        errors.append("bucket migration should create private buckets")

    if not REMOTE_SETUP_SCRIPT.exists():
        errors.append("missing remote Supabase setup script")
    else:
        setup = REMOTE_SETUP_SCRIPT.read_text(encoding="utf-8")
        for token in [
            "--apply-migrations",
            "--target",
            "--schema-report",
            "--legacy-compatible-seed",
            "SUPABASE_DB_URL",
            "psql",
            "ensureBucket",
            "REQUIRED_TABLES",
            "LEGACY_CASE_TABLES",
            "legacy_case_schema",
            "assertQuoteValidation",
            "--seed-inconsistent",
            "answer_safe requires approved review",
        ]:
            if token not in setup:
                errors.append(f"remote Supabase setup script missing {token}")
    utils = (ROOT / "api" / "legal-ingest" / "_utils.js").read_text(encoding="utf-8")
    if "normalizeLegacyReviewItem" not in utils or "isSchemaMismatchError" not in utils:
        errors.append("legal ingest utils missing legacy Supabase schema helpers")
    if "human_review_items" not in review_queue or "supabase_legacy" not in review_queue:
        errors.append("review queue should support legacy human_review_items fallback")
        if "approved_legacy_schema" not in approve or "human_review_items" not in approve:
            errors.append("approval endpoint should support legacy review/proposition tables")

    if not PIPELINE_RUNNER.exists():
        errors.append("missing legal RAG pipeline runner")
    else:
        pipeline = PIPELINE_RUNNER.read_text(encoding="utf-8")
        for token in [
            "legal_rag_pipeline_inconsistent_pleadings_v1",
            "--remote",
            "--seed",
            "schema_mode",
            "row_counts",
            "qdrant_indexing",
        ]:
            if token not in pipeline:
                errors.append(f"legal RAG pipeline runner missing {token}")

    for path, label in [
        (QDRANT_QUERY, "Qdrant query script"),
        (QDRANT_RETRIEVER, "shared Qdrant retriever"),
        (QDRANT_RETRIEVAL_SMOKE, "Qdrant retrieval smoke validator"),
        (STUDENT_PACK_MAP, "GitHub Student Pack service map"),
        (STUDENT_PACK_VALIDATOR, "GitHub Student Pack validator"),
        (SOURCE_GATED_DOC, "source-gated legal answer docs"),
        (LEGAL_ANSWER_SCHEMA, "legal answer schema"),
        (EVIDENCE_PACK_SMOKE, "evidence pack smoke script"),
        (SOURCE_GATED_VALIDATOR, "source-gated answer validator"),
        (GOLDEN_QUERY_VALIDATOR, "golden query validator"),
    ]:
        if not path.exists():
            errors.append(f"missing {label}: {path}")

    if QDRANT_QUERY.exists():
        qdrant_query = QDRANT_QUERY.read_text(encoding="utf-8")
        for token in ["searchQdrant", "collectionName", "topK"]:
            if token not in qdrant_query:
                errors.append(f"Qdrant query script missing {token}")

    if QDRANT_RETRIEVER.exists():
        retriever = QDRANT_RETRIEVER.read_text(encoding="utf-8")
        for token in ["points/search", "LEGAL_EMBEDDING_PROVIDER", "hk_proposition_cards"]:
            if token not in retriever:
                errors.append(f"shared Qdrant retriever missing {token}")

    if STUDENT_PACK_MAP.exists():
        student_pack = STUDENT_PACK_MAP.read_text(encoding="utf-8")
        for token in ["DigitalOcean", "Clerk", "Doppler / 1Password", "production_qdrant_host"]:
            if token not in student_pack:
                errors.append(f"Student Pack service map missing {token}")

    if SOURCE_GATED_DOC.exists():
        docs = SOURCE_GATED_DOC.read_text(encoding="utf-8")
        for token in ["No-Source / No-Answer Rule", "Proposition Cards vs Authority", "LLM_PROVIDER=none"]:
            if token not in docs:
                errors.append(f"source-gated docs missing {token}")

    if SOURCE_GATED_VALIDATOR.exists():
        validator = SOURCE_GATED_VALIDATOR.read_text(encoding="utf-8")
        for token in ["No-source/no-answer gate passed", "Invented citation detector passed", "private source"]:
            if token not in validator:
                errors.append(f"source-gated validator missing {token}")

    if GOLDEN_QUERY_VALIDATOR.exists():
        golden = GOLDEN_QUERY_VALIDATOR.read_text(encoding="utf-8")
        for token in ["Golden query validation passed", "answer_with_citations", "cannot_verify"]:
            if token not in golden:
                errors.append(f"golden query validator missing {token}")

    if errors:
        print("Legal ingest storage validation failed:")
        for error in errors:
            print(f"- {error}")
        return 1
    print("Legal ingest storage validation passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
