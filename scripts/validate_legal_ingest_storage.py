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
TENANT_FILTER_VALIDATOR = ROOT / "scripts" / "validate_tenant_filters.js"
CLERK_VALIDATOR = ROOT / "scripts" / "validate_clerk_auth_config.js"
DEPLOYMENT_VALIDATOR = ROOT / "scripts" / "validate_deployment_config.js"
NO_SECRETS_VALIDATOR = ROOT / "scripts" / "validate_no_secrets_committed.js"
PRIVATE_INGEST_VALIDATOR = ROOT / "scripts" / "validate_private_ingestion_blocked.js"
PUBLIC_CORPUS_VALIDATOR = ROOT / "scripts" / "validate_public_corpus_manifest.js"
HYBRID_RETRIEVAL_VALIDATOR = ROOT / "scripts" / "validate_hybrid_retrieval.js"
REVIEW_PROMOTION_VALIDATOR = ROOT / "scripts" / "validate_review_promotion.js"
PRIVATE_ACCESS_VALIDATOR = ROOT / "scripts" / "validate_private_source_access.js"
HARDENING_VALIDATOR = ROOT / "scripts" / "validate_production_hardening_scaffolds.js"
READINESS_REPORT = ROOT / "scripts" / "report_mvp_readiness.js"
HARDENING_DOC = ROOT / "docs" / "production-hardening-roadmap.md"
DIGITALOCEAN_COMPOSE = ROOT / "infra" / "digitalocean" / "docker-compose.demo.yml"
FASTAPI_MAIN = ROOT / "src" / "api" / "main.py"
PUBLIC_CORPUS_V1 = ROOT / "data" / "legal_ingest" / "public_corpus_v1" / "corpus_manifest.json"
PUBLIC_CORPUS_V1_REGISTRY = ROOT / "data" / "legal_ingest" / "public_corpus_v1" / "source_registry.json"
PUBLIC_CORPUS_CONTRACT = ROOT / "docs" / "public-corpus-ingestion-contract.md"
PUBLIC_CORPUS_V1_VALIDATOR = ROOT / "scripts" / "validate_public_corpus_v1.js"
EMBEDDING_ADAPTER = ROOT / "src" / "retrieval" / "embedding_adapter.js"
RERANK_ADAPTER = ROOT / "src" / "retrieval" / "rerank_adapter.js"
EMBEDDING_RERANK_VALIDATOR = ROOT / "scripts" / "validate_embedding_rerank_adapters.js"
RETRIEVAL_BENCHMARK = ROOT / "data" / "legal_ingest" / "mvp" / "retrieval_benchmark_queries.json"
RETRIEVAL_BENCHMARK_RUNNER = ROOT / "scripts" / "run_retrieval_benchmark.js"
RETRIEVAL_QUALITY_VALIDATOR = ROOT / "scripts" / "validate_retrieval_quality_floor.js"
REVIEW_STORE = ROOT / "src" / "review" / "review_store.js"
REVIEW_PROMOTION_API = ROOT / "src" / "review" / "promotion_api.js"
REVIEW_PROMOTION_WORKFLOW_VALIDATOR = ROOT / "scripts" / "validate_review_promotion_workflow.js"
SOURCE_GATED_REVIEW_STATE_VALIDATOR = ROOT / "scripts" / "validate_source_gated_review_state.js"
CRIMINAL_GOLDEN_QUERIES = ROOT / "data" / "legal_ingest" / "mvp" / "golden_queries_criminal_v1.json"
CRIMINAL_GOLDEN_VALIDATOR = ROOT / "scripts" / "validate_criminal_golden_queries_v1.js"


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
        "CLERK_ENABLED",
        "CLERK_JWT_KEY",
        "CLERK_AUTHORIZED_PARTIES",
        "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
        "PRIVATE_SOURCE_INGESTION_ENABLED",
        "PUBLIC_DEMO_MODE",
        "DEMO_DOMAIN",
        "EMBEDDING_PROVIDER",
        "EMBEDDING_MODEL",
        "VOYAGE_API_KEY",
        "COHERE_API_KEY",
        "RERANK_PROVIDER",
        "RERANK_MODEL",
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
        (TENANT_FILTER_VALIDATOR, "tenant filter validator"),
        (CLERK_VALIDATOR, "Clerk auth config validator"),
        (DEPLOYMENT_VALIDATOR, "deployment config validator"),
        (NO_SECRETS_VALIDATOR, "no-secrets validator"),
        (PRIVATE_INGEST_VALIDATOR, "private ingestion blocked validator"),
        (PUBLIC_CORPUS_VALIDATOR, "public corpus manifest validator"),
        (HYBRID_RETRIEVAL_VALIDATOR, "hybrid retrieval validator"),
        (REVIEW_PROMOTION_VALIDATOR, "review promotion validator"),
        (PRIVATE_ACCESS_VALIDATOR, "private source access validator"),
        (HARDENING_VALIDATOR, "production hardening scaffold validator"),
        (READINESS_REPORT, "MVP readiness report script"),
        (HARDENING_DOC, "production hardening roadmap docs"),
        (DIGITALOCEAN_COMPOSE, "DigitalOcean Docker Compose"),
        (FASTAPI_MAIN, "FastAPI demo app"),
        (PUBLIC_CORPUS_V1, "public corpus v1 manifest"),
        (PUBLIC_CORPUS_V1_REGISTRY, "public corpus v1 source registry"),
        (PUBLIC_CORPUS_CONTRACT, "public corpus ingestion contract"),
        (PUBLIC_CORPUS_V1_VALIDATOR, "public corpus v1 validator"),
        (EMBEDDING_ADAPTER, "embedding adapter"),
        (RERANK_ADAPTER, "rerank adapter"),
        (EMBEDDING_RERANK_VALIDATOR, "embedding/rerank adapter validator"),
        (RETRIEVAL_BENCHMARK, "retrieval benchmark queries"),
        (RETRIEVAL_BENCHMARK_RUNNER, "retrieval benchmark runner"),
        (RETRIEVAL_QUALITY_VALIDATOR, "retrieval quality floor validator"),
        (REVIEW_STORE, "review store"),
        (REVIEW_PROMOTION_API, "review promotion API"),
        (REVIEW_PROMOTION_WORKFLOW_VALIDATOR, "review promotion workflow validator"),
        (SOURCE_GATED_REVIEW_STATE_VALIDATOR, "source-gated review-state validator"),
        (CRIMINAL_GOLDEN_QUERIES, "criminal/evidence golden query suite"),
        (CRIMINAL_GOLDEN_VALIDATOR, "criminal/evidence golden query validator"),
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

    if DIGITALOCEAN_COMPOSE.exists():
        compose = DIGITALOCEAN_COMPOSE.read_text(encoding="utf-8")
        for token in ["qdrant/qdrant:latest", "QDRANT__SERVICE__API_KEY", "QDRANT_URL: http://qdrant:6333", "PRIVATE_SOURCE_INGESTION_ENABLED: \"false\""]:
            if token not in compose:
                errors.append(f"DigitalOcean compose missing {token}")
        if "\"6333:6333\"" in compose or "- 6333:6333" in compose:
            errors.append("DigitalOcean compose must not publish Qdrant 6333")

    if FASTAPI_MAIN.exists():
        fastapi_main = FASTAPI_MAIN.read_text(encoding="utf-8")
        if "private ingestion is disabled by default" not in fastapi_main:
            errors.append("FastAPI demo app missing private-ingestion warning")

    if HARDENING_DOC.exists():
        hardening_doc = HARDENING_DOC.read_text(encoding="utf-8")
        for token in ["Production Hardening Roadmap", "machine_candidate -> quote_verified", "Do not upload private books/forms/client documents"]:
            if token not in hardening_doc:
                errors.append(f"production hardening docs missing {token}")

    if PUBLIC_CORPUS_V1.exists():
        corpus = PUBLIC_CORPUS_V1.read_text(encoding="utf-8")
        for token in ["hk_criminal_procedure_evidence_public_demo_v1", "public_demo", "answer_safe_chunk_count"]:
            if token not in corpus:
                errors.append(f"public corpus v1 manifest missing {token}")

    if PUBLIC_CORPUS_V1_REGISTRY.exists():
        registry = PUBLIC_CORPUS_V1_REGISTRY.read_text(encoding="utf-8")
        for token in ["hk_case_2020_minloy", "cap_221_criminal_procedure_ordinance", "public_or_demo_safe"]:
            if token not in registry:
                errors.append(f"public corpus v1 source registry missing {token}")

    if PUBLIC_CORPUS_CONTRACT.exists():
        contract = PUBLIC_CORPUS_CONTRACT.read_text(encoding="utf-8")
        for token in ["Public Corpus Ingestion Contract", "public-demo", "Review and Promotion"]:
            if token not in contract:
                errors.append(f"public corpus ingestion contract missing {token}")

    if EMBEDDING_ADAPTER.exists():
        adapter_js = EMBEDDING_ADAPTER.read_text(encoding="utf-8")
        for token in ["SUPPORTED_EMBEDDING_PROVIDERS", "EMBEDDING_PROVIDER", "openai", "voyage", "cohere"]:
            if token not in adapter_js:
                errors.append(f"embedding adapter missing {token}")

    if RERANK_ADAPTER.exists():
        rerank_js = RERANK_ADAPTER.read_text(encoding="utf-8")
        for token in ["SUPPORTED_RERANK_PROVIDERS", "RERANK_PROVIDER", "localRerank"]:
            if token not in rerank_js:
                errors.append(f"rerank adapter missing {token}")

    if RETRIEVAL_BENCHMARK.exists():
        benchmark = RETRIEVAL_BENCHMARK.read_text(encoding="utf-8")
        for token in ["hk_criminal_evidence_public_demo_retrieval_v1", "expected_source_ids_any", "quality_floor"]:
            if token not in benchmark:
                errors.append(f"retrieval benchmark missing {token}")

    if REVIEW_STORE.exists():
        review_store = REVIEW_STORE.read_text(encoding="utf-8")
        for token in ["readReviewStore", "upsertReviewItem", "DEFAULT_STORE_PATH"]:
            if token not in review_store:
                errors.append(f"review store missing {token}")

    if REVIEW_PROMOTION_API.exists():
        promotion_api = REVIEW_PROMOTION_API.read_text(encoding="utf-8")
        for token in ["promoteReviewItem", "toStatus", "sourceText"]:
            if token not in promotion_api:
                errors.append(f"review promotion API missing {token}")

    if CRIMINAL_GOLDEN_QUERIES.exists():
        golden = CRIMINAL_GOLDEN_QUERIES.read_text(encoding="utf-8")
        for token in ["hk_criminal_procedure_evidence_v05_golden_queries", "burden_standard", "right_to_silence"]:
            if token not in golden:
                errors.append(f"criminal/evidence golden queries missing {token}")

    if errors:
        print("Legal ingest storage validation failed:")
        for error in errors:
            print(f"- {error}")
        return 1
    print("Legal ingest storage validation passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
