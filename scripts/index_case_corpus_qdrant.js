#!/usr/bin/env node
/* Dry-run or index L1-L3.5 case corpus records into case-law collections. */

const {
  loadCaseCorpus,
} = require("../src/legal_answer/case_corpus/case_corpus_store");

function hasFlag(name) {
  return process.argv.includes(name);
}

const dryRun = hasFlag("--dry-run") || !process.env.QDRANT_URL;
const sample = hasFlag("--sample") || process.argv.includes("--dry-run");
const corpus = loadCaseCorpus({ mode: sample ? "sample" : "full" });

const collections = {
  hk_case_paragraphs_openrouter_2048: corpus.paragraphs.map(item => ({
    id: item.paragraph_id,
    text: item.paragraph_text,
    payload: {
      case_id: item.case_id,
      paragraph_id: item.paragraph_id,
      case_name: item.case_name,
      citation: item.neutral_citation,
      court: item.court,
      date: item.judgment_date,
      issue_tags: item.issue_tags_candidate || [],
      source_url: item.source_url,
      checksum: item.checksum,
      answer_layer_status: "research_only",
      review_status: item.review_status,
      tenant_id: "public",
      source_visibility: "public_demo",
    },
  })),
  hk_case_propositions_openrouter_2048: corpus.propositions.map(item => ({
    id: item.proposition_id,
    text: item.proposition_text,
    payload: {
      case_id: item.case_id,
      proposition_id: item.proposition_id,
      case_name: item.case_name,
      citation: item.neutral_citation,
      court: item.court,
      date: "",
      issue_tags: item.issue_tags || [],
      source_url: "",
      checksum: "",
      answer_layer_status: "research_only",
      review_status: item.review_status,
      tenant_id: "public",
      source_visibility: "public_demo",
    },
  })),
  hk_case_principles_openrouter_2048: corpus.principles.map(item => ({
    id: item.principle_id,
    text: item.principle_text,
    payload: {
      case_id: "",
      principle_id: item.principle_id,
      case_name: "",
      citation: "",
      court: item.authority_strength,
      date: "",
      issue_tags: item.issue_tags || [],
      source_url: "",
      checksum: "",
      answer_layer_status: "research_only",
      review_status: item.review_status,
      tenant_id: "public",
      source_visibility: "public_demo",
    },
  })),
  hk_case_digests_openrouter_2048: corpus.digests.map(item => ({
    id: item.case_digest_card_id,
    text: [item.case_name, item.neutral_citation, item.facts_summary, ...(item.issues || []), ...(item.holdings || [])].join("\n"),
    payload: {
      case_id: item.case_id,
      digest_id: item.case_digest_card_id,
      case_name: item.case_name,
      citation: item.neutral_citation,
      court: item.court,
      date: item.judgment_date,
      issue_tags: [],
      source_url: item.source_url,
      checksum: "",
      answer_layer_status: "research_only",
      review_status: item.review_status,
      tenant_id: "public",
      source_visibility: "public_demo",
    },
  })),
};

const summary = {
  indexer: "index_case_corpus_qdrant",
  dry_run: dryRun,
  mode: sample ? "sample" : "full",
  embedding_model: process.env.OPENROUTER_EMBEDDING_MODEL || "openrouter_2048_configured_elsewhere",
  dimension: Number(process.env.LEGAL_EMBEDDING_DIM || 2048),
  collections: Object.fromEntries(Object.entries(collections).map(([name, points]) => [name, {
    points: points.length,
    sample_payload: points[0]?.payload || null,
  }])),
  status: dryRun ? "dry_run_ready_no_provider_calls" : "not_implemented_live_index_requires_provider_guard",
};

if (!dryRun) {
  console.error("Live Qdrant indexing is intentionally blocked in this PR. Run with --dry-run --sample until provider and collection guards are reviewed.");
  process.exit(1);
}

console.log(JSON.stringify(summary, null, 2));
