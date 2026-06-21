#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const MVP_PATH = path.join(ROOT, "data", "legal_ingest", "mvp", "hk_law_claude_mvp.json");
const DOC_PATH = path.join(ROOT, "docs", "hk-law-claude-mvp.md");
const MEMORY_MIGRATION = path.join(ROOT, "supabase", "migrations", "20260616000000_create_legal_answer_memory_tables.sql");
const CACHE_HELPER = path.join(ROOT, "legal-ingest-service", "cache", "retrieved_law_cache.py");
const API_CACHE_HELPER = path.join(ROOT, "api", "legal-ingest", "cache.js");
const SEARCH_EVIDENCE_API = path.join(ROOT, "api", "search-evidence.js");
const QDRANT_INDEXER = path.join(ROOT, "scripts", "index_legal_ingest_qdrant.js");
const QDRANT_VALIDATOR = path.join(ROOT, "scripts", "validate_qdrant_legal_index.js");
const PIPELINE_TABLES_MIGRATION = path.join(ROOT, "supabase", "migrations", "20260615000000_create_legal_rag_pipeline_tables.sql");
const SOURCE_GATED_DOC = path.join(ROOT, "docs", "source-gated-legal-answer-engine.md");
const LEGAL_ANSWER_SCHEMA = path.join(ROOT, "src", "legal_answer", "schema.js");
const EVIDENCE_PACK_BUILDER = path.join(ROOT, "src", "legal_answer", "build_evidence_pack.js");
const SOURCE_GATED_GENERATOR = path.join(ROOT, "src", "legal_answer", "generate_source_gated_answer.js");
const LEGAL_ANSWER_VERIFIER = path.join(ROOT, "src", "legal_answer", "verify_legal_answer.js");
const LEGAL_ASSISTANT_CLI = path.join(ROOT, "scripts", "query_legal_assistant.js");
const GOLDEN_QUERY_VALIDATOR = path.join(ROOT, "scripts", "validate_legal_golden_queries.js");
const SOURCE_GATED_VALIDATOR = path.join(ROOT, "scripts", "validate_source_gated_answer.js");
const GOLDEN_QUERIES = path.join(ROOT, "data", "legal_ingest", "mvp", "golden_queries.json");
const DIGITALOCEAN_COMPOSE = path.join(ROOT, "infra", "digitalocean", "docker-compose.demo.yml");
const DIGITALOCEAN_DOC = path.join(ROOT, "docs", "digitalocean-qdrant-fastapi-demo.md");
const CLERK_DOC = path.join(ROOT, "docs", "clerk-tenant-auth.md");
const SECRETS_DOC = path.join(ROOT, "docs", "secrets-doppler-1password.md");
const FASTAPI_DOCKERFILE = path.join(ROOT, "Dockerfile.fastapi");
const FASTAPI_MAIN = path.join(ROOT, "src", "api", "main.py");
const FASTAPI_AUTH = path.join(ROOT, "src", "api", "auth.py");
const TENANT_FILTER_VALIDATOR = path.join(ROOT, "scripts", "validate_tenant_filters.js");
const CLERK_VALIDATOR = path.join(ROOT, "scripts", "validate_clerk_auth_config.js");
const DEPLOYMENT_VALIDATOR = path.join(ROOT, "scripts", "validate_deployment_config.js");
const NO_SECRETS_VALIDATOR = path.join(ROOT, "scripts", "validate_no_secrets_committed.js");
const PRIVATE_INGEST_VALIDATOR = path.join(ROOT, "scripts", "validate_private_ingestion_blocked.js");
const PUBLIC_CORPUS_VALIDATOR = path.join(ROOT, "scripts", "validate_public_corpus_manifest.js");
const HYBRID_RETRIEVAL_VALIDATOR = path.join(ROOT, "scripts", "validate_hybrid_retrieval.js");
const REVIEW_PROMOTION_VALIDATOR = path.join(ROOT, "scripts", "validate_review_promotion.js");
const PRIVATE_ACCESS_VALIDATOR = path.join(ROOT, "scripts", "validate_private_source_access.js");
const HARDENING_VALIDATOR = path.join(ROOT, "scripts", "validate_production_hardening_scaffolds.js");
const READINESS_REPORT = path.join(ROOT, "scripts", "report_mvp_readiness.js");
const HARDENING_DOC = path.join(ROOT, "docs", "production-hardening-roadmap.md");
const PUBLIC_CORPUS_V1 = path.join(ROOT, "data", "legal_ingest", "public_corpus_v1", "corpus_manifest.json");
const PUBLIC_CORPUS_V1_REGISTRY = path.join(ROOT, "data", "legal_ingest", "public_corpus_v1", "source_registry.json");
const PUBLIC_CORPUS_V1_CHUNKS = path.join(ROOT, "data", "legal_ingest", "public_corpus_v1", "chunk_manifest.json");
const PUBLIC_CORPUS_CONTRACT = path.join(ROOT, "docs", "public-corpus-ingestion-contract.md");
const PUBLIC_CORPUS_V1_VALIDATOR = path.join(ROOT, "scripts", "validate_public_corpus_v1.js");
const EMBEDDING_ADAPTER = path.join(ROOT, "src", "retrieval", "embedding_adapter.js");
const RERANK_ADAPTER = path.join(ROOT, "src", "retrieval", "rerank_adapter.js");
const EMBEDDING_RERANK_VALIDATOR = path.join(ROOT, "scripts", "validate_embedding_rerank_adapters.js");
const PRODUCTION_SETUP_CONTRACT = path.join(ROOT, "data", "legal_ingest", "mvp", "production_provider_setup.json");
const PRODUCTION_SETUP_VALIDATOR = path.join(ROOT, "scripts", "validate_production_setup_contract.js");
const RETRIEVAL_BENCHMARK = path.join(ROOT, "data", "legal_ingest", "mvp", "retrieval_benchmark_queries.json");
const RETRIEVAL_BENCHMARK_RUNNER = path.join(ROOT, "scripts", "run_retrieval_benchmark.js");
const RETRIEVAL_QUALITY_VALIDATOR = path.join(ROOT, "scripts", "validate_retrieval_quality_floor.js");
const REVIEW_STORE = path.join(ROOT, "src", "review", "review_store.js");
const REVIEW_PROMOTION_API = path.join(ROOT, "src", "review", "promotion_api.js");
const REVIEW_PROMOTION_CLI = path.join(ROOT, "scripts", "review_promote_claim.js");
const REVIEW_PROMOTION_WORKFLOW_VALIDATOR = path.join(ROOT, "scripts", "validate_review_promotion_workflow.js");
const SOURCE_GATED_REVIEW_STATE_VALIDATOR = path.join(ROOT, "scripts", "validate_source_gated_review_state.js");
const CRIMINAL_GOLDEN_QUERIES = path.join(ROOT, "data", "legal_ingest", "mvp", "golden_queries_criminal_v1.json");
const CRIMINAL_GOLDEN_VALIDATOR = path.join(ROOT, "scripts", "validate_criminal_golden_queries_v1.js");
const CASE_GRAPH_BASE = path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1");
const CASE_GRAPH_DOCTRINE_TREE = path.join(CASE_GRAPH_BASE, "doctrine_tree.json");
const CASE_GRAPH_PROCEDURE_TREE = path.join(CASE_GRAPH_BASE, "procedure_tree.json");
const CASE_GRAPH_TAXONOMY = path.join(CASE_GRAPH_BASE, "evidence_taxonomy.json");
const CASE_GRAPH_LABELS = path.join(CASE_GRAPH_BASE, "significance_labels.json");
const CASE_GRAPH_FIXTURE_CASES = path.join(CASE_GRAPH_BASE, "fixtures", "sample_cases.json");
const CASE_GRAPH_FIXTURE_PARAGRAPHS = path.join(CASE_GRAPH_BASE, "fixtures", "sample_paragraph_cards.json");
const CASE_GRAPH_FIXTURE_PROPOSITIONS = path.join(CASE_GRAPH_BASE, "fixtures", "sample_proposition_cards.attached.json");
const CASE_GRAPH_REVIEW_QUEUE = path.join(CASE_GRAPH_BASE, "fixtures", "sample_proposition_review_queue.json");
const CASE_GRAPH_BENCHMARK = path.join(CASE_GRAPH_BASE, "case_graph_benchmark_queries.json");
const CASE_CARD_SCHEMA = path.join(ROOT, "src", "case_graph", "case_card_schema.js");
const PROPOSITION_CARD_SCHEMA = path.join(ROOT, "src", "case_graph", "proposition_card_schema.js");
const CASE_GRAPH_INGEST = path.join(ROOT, "src", "case_graph", "ingest_case_to_paragraphs.js");
const CASE_GRAPH_EXTRACT = path.join(ROOT, "src", "case_graph", "extract_candidate_propositions.js");
const CASE_GRAPH_ATTACH = path.join(ROOT, "src", "case_graph", "attach_propositions_to_tree.js");
const CASE_GRAPH_RETRIEVE = path.join(ROOT, "src", "case_graph", "retrieve_case_graph.js");
const CASE_GRAPH_EVIDENCE_PACK = path.join(ROOT, "src", "case_graph", "build_case_graph_evidence_pack.js");
const CASE_GRAPH_REVIEW_QUEUE_BUILDER = path.join(ROOT, "src", "case_graph", "proposition_review_queue.js");
const CASE_GRAPH_TREE_VALIDATOR = path.join(ROOT, "scripts", "validate_case_graph_tree_v1.js");
const CASE_GRAPH_SIGNIFICANCE_VALIDATOR = path.join(ROOT, "scripts", "validate_case_graph_significance.js");
const CASE_GRAPH_REVIEW_QUEUE_VALIDATOR = path.join(ROOT, "scripts", "validate_proposition_review_queue.js");
const CASE_GRAPH_BENCHMARK_RUNNER = path.join(ROOT, "scripts", "run_case_graph_benchmark.js");
const CASE_FRUITS_PILOT_MANIFEST = path.join(CASE_GRAPH_BASE, "bail_pilot", "pilot_manifest.json");
const CASE_FRUITS_NODE_MAPPING = path.join(CASE_GRAPH_BASE, "bail_pilot", "node_mapping.json");
const CASE_FRUITS_LINKS = path.join(CASE_GRAPH_BASE, "bail_pilot", "proposition_node_links.json");
const CASE_FRUITS_L4 = path.join(CASE_GRAPH_BASE, "bail_pilot", "l4_case_applications.json");
const CASE_FRUITS_L5 = path.join(CASE_GRAPH_BASE, "bail_pilot", "l5_paragraph_proof.json");
const CASE_FRUITS_DOC = path.join(ROOT, "docs", "case-fruits-tree-enrichment-pilot.md");
const CASE_FRUIT_GROWTH_LOOP_CONFIG = path.join(CASE_GRAPH_BASE, "case_fruit_growth_loop.json");
const CASE_FRUIT_GROWTH_LOOP = path.join(ROOT, "src", "case_graph", "case_fruit_growth_loop.js");
const CASE_FRUIT_GROWTH_LOOP_SCRIPT = path.join(ROOT, "scripts", "run_case_fruit_growth_loop.js");
const CASE_FRUIT_GROWTH_LOOP_VALIDATOR = path.join(ROOT, "scripts", "validate_case_fruit_growth_loop.js");
const CASE_FRUIT_GROWTH_LOOP_DOC = path.join(ROOT, "docs", "case-fruit-growth-loop.md");
const CASE_FRUIT_SOP_BRIDGE = path.join(ROOT, "src", "case_graph", "case_fruit_sop_bridge.js");
const CASE_FRUIT_SOP_BRIDGE_SCRIPT = path.join(ROOT, "scripts", "build_case_fruit_sop_bridge.js");
const CASE_FRUIT_SOP_BRIDGE_VALIDATOR = path.join(ROOT, "scripts", "validate_case_fruit_sop_bridge.js");
const CASE_FRUIT_SOP_API = path.join(ROOT, "api", "case-fruit-sop.js");
const CASE_FRUIT_SOP_API_VALIDATOR = path.join(ROOT, "scripts", "validate_case_fruit_sop_api.js");
const CASE_FRUITS_LINKER = path.join(ROOT, "src", "case_graph", "link_case_fruits_to_doctrine_tree.js");
const CASE_FRUITS_LOCAL_EVIDENCE = path.join(ROOT, "src", "case_graph", "local_case_fruit_evidence.js");
const CASE_FRUITS_BUILD_SCRIPT = path.join(ROOT, "scripts", "build_bail_case_fruits_pilot.js");
const CASE_FRUITS_VALIDATOR = path.join(ROOT, "scripts", "validate_bail_case_fruits_pilot.js");
const CASE_FRUITS_API_VALIDATOR = path.join(ROOT, "scripts", "validate_case_fruits_api_fallback.js");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const [key, ...rest] = line.split("=");
    const value = rest.join("=").trim().replace(/^['"]|['"]$/g, "");
    if (value) env[key.trim()] = value;
  }
  return env;
}

function loadEnv() {
  return {
    ...parseEnvFile(path.join(ROOT, ".env")),
    ...parseEnvFile(path.join(ROOT, ".env.local")),
    ...process.env,
  };
}

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

function fileIncludes(filePath, needles, errors) {
  assert(fs.existsSync(filePath), `missing file: ${path.relative(ROOT, filePath)}`, errors);
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  for (const needle of needles) {
    assert(text.includes(needle), `${path.relative(ROOT, filePath)} missing ${needle}`, errors);
  }
}

function validateMvpConfig(errors) {
  assert(fs.existsSync(MVP_PATH), "missing MVP config", errors);
  if (!fs.existsSync(MVP_PATH)) return null;
  const mvp = JSON.parse(fs.readFileSync(MVP_PATH, "utf8"));
  assert(mvp.mvp_id === "hk_law_claude_minimum_v1", "unexpected MVP id", errors);
  assert(Array.isArray(mvp.gates) && mvp.gates.length >= 7, "MVP must define at least 7 gates", errors);
  const gateIds = new Set((mvp.gates || []).map(g => g.gate_id));
  for (const gateId of [
    "corpus_input_and_licence_controls",
    "legal_processing_and_structured_objects",
    "embedding_and_vector_storage",
    "retrieval_and_reranking",
    "authority_treatment_and_answer_contract",
    "review_promotion_and_evals",
    "stored_retrieved_law_and_sop_cache",
  ]) {
    assert(gateIds.has(gateId), `MVP gate missing: ${gateId}`, errors);
  }
  assert(mvp.safe_book_form_upload_policy, "MVP safe book/form upload policy missing", errors);
  assert(mvp.scale_ladder, "MVP scale ladder missing", errors);
  return mvp;
}

function staticScaffoldReport(errors) {
  fileIncludes(DOC_PATH, [
    "Gate 1 - Corpus Input And Licence Controls",
    "Gate 7 - Stored Retrieved Law / SOP Cache",
    "Safe Upload Rule",
  ], errors);
  fileIncludes(PIPELINE_TABLES_MIGRATION, [
    "legal_ingest_runs",
    "legal_chunks",
    "vector_index_manifests",
    "retrieval_eval_cases",
  ], errors);
  fileIncludes(MEMORY_MIGRATION, [
    "retrieval_bundles",
    "legal_answer_snapshots",
    "sop_playbooks",
    "answer_safe_requires_approved",
  ], errors);
  fileIncludes(CACHE_HELPER, [
    "source_fingerprint",
    "can_reuse_cached_answer",
    "build_sop_playbook_record",
  ], errors);
  fileIncludes(API_CACHE_HELPER, [
    "findCachedLegalAnswer",
    "writeLegalAnswerCache",
    "buildSopPlaybookRecord",
    "legalIngestSourceFingerprint",
  ], errors);
  fileIncludes(SEARCH_EVIDENCE_API, [
    "findCachedLegalAnswer",
    "writeLegalAnswerCache",
    "legal_answer_cache",
  ], errors);
  fileIncludes(QDRANT_INDEXER, [
    "QDRANT_URL",
    "hk_legal_paragraphs",
    "hk_proposition_cards",
    "hk_form_metadata",
    "LEGAL_EMBEDDING_PROVIDER",
  ], errors);
  fileIncludes(QDRANT_VALIDATOR, [
    "QDRANT_URL",
    "points_count",
    "hk_legal_paragraphs",
    "hk_proposition_cards",
    "hk_form_metadata",
  ], errors);
  fileIncludes(SOURCE_GATED_DOC, [
    "No-Source / No-Answer Rule",
    "Proposition Cards vs Authority",
    "Optional LLM Adapter",
  ], errors);
  fileIncludes(LEGAL_ANSWER_SCHEMA, [
    "legalSource",
    "evidenceChunk",
    "legalClaim",
    "legalAnswer",
    "retrievalTrace",
    "verificationResult",
  ], errors);
  fileIncludes(EVIDENCE_PACK_BUILDER, [
    "buildEvidencePack",
    "proposition_families",
    "retrieval_trace",
  ], errors);
  fileIncludes(SOURCE_GATED_GENERATOR, [
    "generateSourceGatedAnswer",
    "cannot_verify",
    "retrieved_evidence_not_on_point",
  ], errors);
  fileIncludes(LEGAL_ANSWER_VERIFIER, [
    "verifyLegalAnswer",
    "invented citation-like string",
    "private/licensed source used in public-demo mode",
  ], errors);
  fileIncludes(LEGAL_ASSISTANT_CLI, [
    "query_legal_assistant",
    "generateSourceGatedAnswer",
    "verifyLegalAnswer",
  ], errors);
  fileIncludes(GOLDEN_QUERY_VALIDATOR, [
    "Golden query validation passed",
    "answer_with_citations",
    "cannot_verify",
  ], errors);
  fileIncludes(SOURCE_GATED_VALIDATOR, [
    "Source-gated answer smoke passed",
    "No-source/no-answer gate passed",
    "Invented citation detector passed",
  ], errors);
  fileIncludes(GOLDEN_QUERIES, [
    "inconsistent_pleadings_core",
    "criminal_bail_gap",
    "answer_with_citations",
    "cannot_verify",
  ], errors);
  fileIncludes(DIGITALOCEAN_COMPOSE, [
    "qdrant/qdrant:latest",
    "QDRANT__SERVICE__API_KEY",
    "QDRANT_URL: http://qdrant:6333",
    "PRIVATE_SOURCE_INGESTION_ENABLED: \"false\"",
  ], errors);
  fileIncludes(DIGITALOCEAN_DOC, [
    "do not expose 6333 publicly",
    "Confirm private ingestion is blocked",
  ], errors);
  fileIncludes(CLERK_DOC, [
    "must never trust `tenant_id`",
    "CLERK_ENABLED=false",
  ], errors);
  fileIncludes(SECRETS_DOC, [
    "Doppler",
    "1Password",
    "Do not commit runtime env files",
  ], errors);
  fileIncludes(FASTAPI_DOCKERFILE, [
    "fastapi",
    "uvicorn",
    "src.api.main:app",
  ], errors);
  fileIncludes(FASTAPI_MAIN, [
    "HK LegalTech Source-Gated RAG Demo",
    "private ingestion is disabled by default",
  ], errors);
  fileIncludes(FASTAPI_AUTH, [
    "AuthContext",
    "require_private_auth",
    "tenant_id = org_id or user_id",
  ], errors);
  fileIncludes(TENANT_FILTER_VALIDATOR, ["Tenant filter validation passed"], errors);
  fileIncludes(CLERK_VALIDATOR, ["Clerk auth config validation passed"], errors);
  fileIncludes(DEPLOYMENT_VALIDATOR, ["DigitalOcean deployment config validation passed"], errors);
  fileIncludes(NO_SECRETS_VALIDATOR, ["No secrets committed"], errors);
  fileIncludes(PRIVATE_INGEST_VALIDATOR, ["Private ingestion blocked by default"], errors);
  fileIncludes(PUBLIC_CORPUS_VALIDATOR, ["Public corpus manifest validation passed"], errors);
  fileIncludes(HYBRID_RETRIEVAL_VALIDATOR, ["Hybrid retrieval validation passed"], errors);
  fileIncludes(REVIEW_PROMOTION_VALIDATOR, ["Review promotion validation passed"], errors);
  fileIncludes(PRIVATE_ACCESS_VALIDATOR, ["Private source access validation passed"], errors);
  fileIncludes(HARDENING_VALIDATOR, ["Production hardening scaffold validation passed"], errors);
  fileIncludes(READINESS_REPORT, ["estimated_overall_done_percent", "production_readiness_estimate", "key_remaining_blockers"], errors);
  fileIncludes(HARDENING_DOC, [
    "Production Hardening Roadmap",
    "machine_candidate -> quote_verified -> source_verified -> lawyer_reviewed -> answer_safe",
    "Do not upload private books/forms/client documents",
  ], errors);
  fileIncludes(PUBLIC_CORPUS_V1, [
    "hk_criminal_procedure_evidence_public_demo_v1",
    "public_demo",
    "answer_safe_chunk_count",
  ], errors);
  fileIncludes(PUBLIC_CORPUS_V1_REGISTRY, [
    "hk_case_2020_minloy",
    "cap_221_criminal_procedure_ordinance",
    "public_or_demo_safe",
  ], errors);
  fileIncludes(PUBLIC_CORPUS_V1_CHUNKS, [
    "prop_inconsistent_positions_scope_minloy_p31",
    "source_visibility",
    "embedding_status",
  ], errors);
  fileIncludes(PUBLIC_CORPUS_CONTRACT, [
    "Public Corpus Ingestion Contract",
    "private/licensed",
    "Review and Promotion",
  ], errors);
  fileIncludes(PUBLIC_CORPUS_V1_VALIDATOR, ["Public corpus v1 validation passed"], errors);
  fileIncludes(EMBEDDING_ADAPTER, [
    "SUPPORTED_EMBEDDING_PROVIDERS",
    "EMBEDDING_PROVIDER",
    "openai",
    "voyage",
    "cohere",
  ], errors);
  fileIncludes(RERANK_ADAPTER, [
    "SUPPORTED_RERANK_PROVIDERS",
    "RERANK_PROVIDER",
    "localRerank",
  ], errors);
  fileIncludes(EMBEDDING_RERANK_VALIDATOR, ["Embedding adapter validation passed", "Rerank adapter validation passed"], errors);
  fileIncludes(PRODUCTION_SETUP_CONTRACT, [
    "local_dev_smoke",
    "production_retrieval",
    "private_source_ingestion",
    "large_scale_20k_preflight",
  ], errors);
  fileIncludes(PRODUCTION_SETUP_VALIDATOR, [
    "current_safe_action",
    "production_embeddings_configured",
    "production_reranker_configured",
    "bail_gold_review_set_exists",
  ], errors);
  fileIncludes(RETRIEVAL_BENCHMARK, [
    "hk_criminal_evidence_public_demo_retrieval_v1",
    "expected_source_ids_any",
    "quality_floor",
  ], errors);
  fileIncludes(RETRIEVAL_BENCHMARK_RUNNER, [
    "runBenchmark",
    "quality_status",
    "private_source_leakage_report",
  ], errors);
  fileIncludes(RETRIEVAL_QUALITY_VALIDATOR, ["Retrieval benchmark completed"], errors);
  fileIncludes(REVIEW_STORE, ["readReviewStore", "upsertReviewItem", "DEFAULT_STORE_PATH"], errors);
  fileIncludes(REVIEW_PROMOTION_API, ["promoteReviewItem", "toStatus", "sourceText"], errors);
  fileIncludes(REVIEW_PROMOTION_CLI, ["promoteReviewItem", "--to", "--source-text"], errors);
  fileIncludes(REVIEW_PROMOTION_WORKFLOW_VALIDATOR, ["Review promotion workflow validation passed"], errors);
  fileIncludes(SOURCE_GATED_REVIEW_STATE_VALIDATOR, ["Source-gated answer with review-state validation passed"], errors);
  fileIncludes(CRIMINAL_GOLDEN_QUERIES, [
    "hk_criminal_procedure_evidence_v05_golden_queries",
    "burden_standard",
    "right_to_silence",
  ], errors);
  fileIncludes(CRIMINAL_GOLDEN_VALIDATOR, ["Criminal golden query suite validation passed"], errors);
  fileIncludes(CASE_GRAPH_DOCTRINE_TREE, [
    "hk_criminal_evidence_doctrine_tree_v1",
    "criminal_evidence.confession",
    "criminal_evidence.abuse_of_process",
  ], errors);
  fileIncludes(CASE_GRAPH_PROCEDURE_TREE, [
    "hk_criminal_evidence_procedure_tree_v1",
    "criminal_procedure.pretrial_admissibility",
    "criminal_procedure.appeal_review",
  ], errors);
  fileIncludes(CASE_GRAPH_TAXONOMY, ["hk_criminal_evidence_taxonomy_v1", "confession", "similar_fact"], errors);
  fileIncludes(CASE_GRAPH_LABELS, ["states_rule", "not_authority_party_argument", "procedural_history_only"], errors);
  fileIncludes(CASE_GRAPH_FIXTURE_CASES, ["demo_fixture", "not_real_authority", "candidate_propositions"], errors);
  fileIncludes(CASE_GRAPH_FIXTURE_PARAGRAPHS, ["criminal_evidence_paragraph_cards_v1", "paragraph_cards"], errors);
  fileIncludes(CASE_GRAPH_FIXTURE_PROPOSITIONS, ["criminal_evidence_tree_attached_propositions_v1", "tree_node_ids"], errors);
  fileIncludes(CASE_GRAPH_REVIEW_QUEUE, ["criminal_evidence_proposition_review_queue_v1", "group_keys"], errors);
  fileIncludes(CASE_GRAPH_BENCHMARK, ["hk_criminal_evidence_case_graph_benchmark_v1", "expected_tree_node_ids_any"], errors);
  fileIncludes(CASE_CARD_SCHEMA, ["caseCard", "paragraphCard", "validateCaseCard", "validateParagraphCard"], errors);
  fileIncludes(PROPOSITION_CARD_SCHEMA, ["propositionCard", "SIGNIFICANCE_LABELS", "validatePropositionCard"], errors);
  fileIncludes(CASE_GRAPH_INGEST, ["ingestCasesToParagraphs", "paragraph_cards"], errors);
  fileIncludes(CASE_GRAPH_EXTRACT, ["CASE_GRAPH_LLM_PROVIDER", "case_graph_llm_disabled_by_default"], errors);
  fileIncludes(CASE_GRAPH_ATTACH, ["attachPropositionsToTree", "inferTreeNodes"], errors);
  fileIncludes(CASE_GRAPH_RETRIEVE, ["retrieveCaseGraph", "significance_label", "review_state"], errors);
  fileIncludes(CASE_GRAPH_EVIDENCE_PACK, ["buildCaseGraphEvidencePack", "case_graph_tree_first_v1"], errors);
  fileIncludes(CASE_GRAPH_REVIEW_QUEUE_BUILDER, ["buildPropositionReviewQueue", "group_keys"], errors);
  fileIncludes(CASE_GRAPH_TREE_VALIDATOR, ["Doctrine/procedure tree validation passed"], errors);
  fileIncludes(CASE_GRAPH_SIGNIFICANCE_VALIDATOR, ["Case graph significance validation passed"], errors);
  fileIncludes(CASE_GRAPH_REVIEW_QUEUE_VALIDATOR, ["Proposition review queue validation passed"], errors);
  fileIncludes(CASE_GRAPH_BENCHMARK_RUNNER, ["case_graph_fixture_quality_floor_satisfied"], errors);
  fileIncludes(CASE_FRUITS_PILOT_MANIFEST, ["criminal_bail_case_fruits_pilot_v1", "bail_only", "L4", "L5"], errors);
  fileIncludes(CASE_FRUITS_NODE_MAPPING, ["prop_demo_bail_conditions_001", "criminal_procedure_hk.bail_factors", "criminal_procedure_hk.bail_flow_step5"], errors);
  fileIncludes(CASE_FRUITS_LINKS, ["proposition_node_links", "candidate_only", "machine_candidate"], errors);
  fileIncludes(CASE_FRUITS_L4, ["l4_case_applications", "Bail conditions / surety / flight-risk management"], errors);
  fileIncludes(CASE_FRUITS_L5, ["l5_paragraph_proof", "quote_verified_against_fixture"], errors);
  fileIncludes(CASE_FRUITS_DOC, ["Case Fruits Tree Enrichment Pilot", "L4", "L5", "Not bulk case scraping"], errors);
  fileIncludes(CASE_FRUIT_GROWTH_LOOP_CONFIG, [
    "hk_criminal_case_fruit_growth_loop_v1",
    "max_prompt_paragraphs_per_call",
    "quote_not_found",
    "unsupported_sop_step",
  ], errors);
  fileIncludes(CASE_FRUIT_GROWTH_LOOP, [
    "buildLoopReport",
    "validateBatchAgainstLoop",
    "wrong_branch_candidate",
    "auto_promote_answer_safe: false",
  ], errors);
  fileIncludes(CASE_FRUIT_GROWTH_LOOP_SCRIPT, [
    "--execute-safe",
    "--include-remote",
    "command_results",
  ], errors);
  fileIncludes(CASE_FRUIT_GROWTH_LOOP_VALIDATOR, ["Case fruit growth loop validation passed"], errors);
  fileIncludes(CASE_FRUIT_GROWTH_LOOP_DOC, [
    "DeepSeek may propose",
    "SOP Contribution",
    "It may not run 20k",
  ], errors);
  fileIncludes(CASE_FRUIT_SOP_BRIDGE, [
    "buildCaseFruitSopBridge",
    "legalIngestSourceFingerprint",
    "no_llm_tokens_used: true",
    "auto_promote_answer_safe: false",
  ], errors);
  fileIncludes(CASE_FRUIT_SOP_BRIDGE_SCRIPT, [
    "--node-id",
    "--write-cache",
    "buildCaseFruitSopBridge",
  ], errors);
  fileIncludes(CASE_FRUIT_SOP_BRIDGE_VALIDATOR, ["Case fruit SOP bridge validation passed"], errors);
  fileIncludes(CASE_FRUIT_SOP_API, [
    "buildCaseFruitSopBridge",
    "writeCaseFruitSopBridgeCache",
    "assertReviewAdmin",
  ], errors);
  fileIncludes(CASE_FRUIT_SOP_API_VALIDATOR, ["Case fruit SOP API validation passed"], errors);
  fileIncludes(CASE_FRUITS_LINKER, ["buildBailCaseFruitLinks", "proposition_node_links", "l5_paragraph_proof"], errors);
  fileIncludes(CASE_FRUITS_LOCAL_EVIDENCE, ["localCaseFruitEvidenceForNode", "not_real_authority", "candidate_only"], errors);
  fileIncludes(CASE_FRUITS_BUILD_SCRIPT, ["Bail case fruits pilot built"], errors);
  fileIncludes(CASE_FRUITS_VALIDATOR, ["Bail case fruits pilot validation passed"], errors);
  fileIncludes(CASE_FRUITS_API_VALIDATOR, ["Case fruits API fallback validation passed"], errors);
  fileIncludes(path.join(ROOT, "api", "doctrine-evidence.js"), ["localCaseFruitEvidenceForNode", "local_case_fruits_fixture_fallback"], errors);
  fileIncludes(path.join(ROOT, "api", "search-evidence.js"), ["localCaseFruitEvidenceForNode", "localEvidenceFallbackForNode"], errors);
}

function runtimeReadiness(env) {
  return {
    env,
    supabase: {
      configured: Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY),
      url_present: Boolean(env.SUPABASE_URL),
      service_role_present: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
    },
    qdrant: {
      configured: Boolean(env.QDRANT_URL),
      url_present: Boolean(env.QDRANT_URL),
    },
    embeddings: {
      configured: Boolean(env.LEGAL_EMBEDDING_PROVIDER || env.EMBEDDING_PROVIDER || env.OPENAI_API_KEY || env.EMBEDDING_API_KEY || env.DEEPSEEK_API_KEY),
      provider: env.LEGAL_EMBEDDING_PROVIDER || env.EMBEDDING_PROVIDER || (env.OPENAI_API_KEY ? "openai" : env.DEEPSEEK_API_KEY ? "deepseek" : ""),
      openai_present: Boolean(env.OPENAI_API_KEY),
      generic_embedding_key_present: Boolean(env.EMBEDDING_API_KEY),
      deepseek_present: Boolean(env.DEEPSEEK_API_KEY),
    },
    inngest: {
      configured: Boolean(env.INNGEST_EVENT_KEY || env.INNGEST_SIGNING_KEY),
      event_key_present: Boolean(env.INNGEST_EVENT_KEY),
      signing_key_present: Boolean(env.INNGEST_SIGNING_KEY),
    },
  };
}

async function supabaseHasColumns(env, table, columns) {
  const url = String(env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) return false;
  try {
    const response = await fetch(`${url}/rest/v1/${table}?select=${columns.map(encodeURIComponent).join(",")}&limit=1`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function answerMemoryRemoteReadiness(env) {
  const checks = await Promise.all([
    supabaseHasColumns(env, "retrieval_bundles", ["bundle_id", "query_hash", "corpus_fingerprint", "retrieval_status"]),
    supabaseHasColumns(env, "legal_answer_snapshots", ["answer_id", "bundle_id", "source_fingerprint", "answer_status"]),
    supabaseHasColumns(env, "sop_playbooks", ["playbook_id", "domain", "source_fingerprint", "status"]),
  ]);
  return {
    configured: checks.every(Boolean),
    retrieval_bundles: checks[0],
    legal_answer_snapshots: checks[1],
    sop_playbooks: checks[2],
  };
}

async function qdrantRemoteReadiness(env) {
  const base = String(env.QDRANT_URL || "").trim().replace(/\/$/, "");
  if (!base) return { configured: false, collections_ready: false, collections: [] };
  const headers = {};
  if (env.QDRANT_API_KEY) headers["api-key"] = env.QDRANT_API_KEY;
  const names = [
    env.QDRANT_COLLECTION_PARAGRAPHS || "hk_legal_paragraphs",
    env.QDRANT_COLLECTION_PROPOSITIONS || "hk_proposition_cards",
    env.QDRANT_COLLECTION_FORMS || "hk_form_metadata",
  ];
  const collections = [];
  for (const name of names) {
    try {
      const response = await fetch(`${base}/collections/${encodeURIComponent(name)}`, { headers });
      const payload = await response.json().catch(() => ({}));
      const result = payload.result || {};
      collections.push({
        name,
        ok: response.ok,
        points_count: result.points_count || 0,
        vector_size: result.config?.params?.vectors?.size,
      });
    } catch (error) {
      collections.push({ name, ok: false, error: error.message });
    }
  }
  return {
    configured: true,
    collections_ready: collections.every(item => item.ok && item.points_count > 0),
    collections,
  };
}

function deriveGateReadiness(mvp, runtime) {
  const byId = Object.fromEntries(mvp.gates.map(g => [g.gate_id, g]));
  const answerMemoryStatus = runtime.answer_memory?.configured
    ? "remote_schema_applied_api_cache_and_sop_wiring_present"
    : "scaffold_added_needs_api_wiring_and_remote_migration";
  const qdrantStatus = runtime.qdrant.configured && runtime.qdrant.collections_ready && runtime.embeddings.configured
    ? (runtime.embeddings.provider === "local-hash" ? "local_dev_indexed_with_hash_embeddings" : "indexed_with_configured_embedding_provider")
    : runtime.qdrant.configured && runtime.embeddings.configured
      ? "config_present_indexer_available_needs_index_run"
      : "indexer_available_not_green_missing_qdrant_or_embedding_config";
  return [
    {
      gate_id: "corpus_input_and_licence_controls",
      status: runtime.supabase.configured ? byId.corpus_input_and_licence_controls.current_repo_status : "blocked_needs_supabase_env",
    },
    {
      gate_id: "legal_processing_and_structured_objects",
      status: byId.legal_processing_and_structured_objects.current_repo_status,
    },
    {
      gate_id: "embedding_and_vector_storage",
      status: qdrantStatus,
    },
    {
      gate_id: "retrieval_and_reranking",
      status: byId.retrieval_and_reranking.current_repo_status,
    },
    {
      gate_id: "authority_treatment_and_answer_contract",
      status: byId.authority_treatment_and_answer_contract.current_repo_status,
    },
    {
      gate_id: "review_promotion_and_evals",
      status: byId.review_promotion_and_evals.current_repo_status,
    },
    {
      gate_id: "stored_retrieved_law_and_sop_cache",
      status: answerMemoryStatus,
    },
    {
      gate_id: "private_source_access_controls",
      status: byId.private_source_access_controls?.current_repo_status || "not_defined",
    },
  ];
}

async function main() {
  const strictProduction = process.argv.includes("--strict-production");
  const errors = [];
  const mvp = validateMvpConfig(errors);
  staticScaffoldReport(errors);
  const env = loadEnv();
  const runtime = runtimeReadiness(env);
  runtime.answer_memory = await answerMemoryRemoteReadiness(env);
  runtime.qdrant = { ...runtime.qdrant, ...(await qdrantRemoteReadiness(env)) };
  delete runtime.env;
  const gate_readiness = mvp ? deriveGateReadiness(mvp, runtime) : [];
  const report = {
    mvp_id: mvp?.mvp_id || "missing",
    scaffold_valid: errors.length === 0,
    runtime,
    gate_readiness,
    production_green: gate_readiness.every(g => g.status === "green"),
    next_blockers: gate_readiness
      .filter(g => /not_green|blocked|partial|needs|pending|scaffold/.test(g.status))
      .map(g => `${g.gate_id}: ${g.status}`),
    errors,
  };
  console.log(JSON.stringify(report, null, 2));
  if (errors.length) process.exit(1);
  if (strictProduction && !report.production_green) process.exit(2);
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
