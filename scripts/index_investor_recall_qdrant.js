#!/usr/bin/env node
/* eslint-disable no-console */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { embed, loadEnv, qdrantRequest } = require("../src/legal_answer/qdrant_retriever");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_INPUT = path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "investor_recall", "case_recall_cards.json");

function parseArgs(argv) {
  const args = { input: DEFAULT_INPUT, collection: "", dryRun: false };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--input") args.input = path.resolve(ROOT, argv[++i] || args.input);
    else if (argv[i] === "--collection") args.collection = argv[++i] || "";
    else if (argv[i] === "--dry-run") args.dryRun = true;
  }
  return args;
}

function uuidFromText(text) {
  const hex = crypto.createHash("sha256").update(text).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

async function ensureCollection(env, collection, dimension) {
  try {
    const existing = await qdrantRequest(env, `/collections/${encodeURIComponent(collection)}`);
    const currentSize = existing.result?.config?.params?.vectors?.size;
    if (currentSize !== dimension) throw new Error(`${collection} vector size ${currentSize} != ${dimension}`);
    return { status: "exists", vector_size: currentSize };
  } catch (error) {
    if (!String(error.message || "").includes("Qdrant HTTP 404")) throw error;
  }
  await qdrantRequest(env, `/collections/${encodeURIComponent(collection)}`, {
    method: "PUT",
    body: { vectors: { size: dimension, distance: "Cosine" } },
  });
  return { status: "created", vector_size: dimension };
}

async function main() {
  const args = parseArgs(process.argv);
  const env = loadEnv();
  const provider = env.LEGAL_EMBEDDING_PROVIDER || env.EMBEDDING_PROVIDER || "local-hash";
  const dimension = Number(env.LEGAL_EMBEDDING_DIM || (provider === "openai" ? 1536 : 384));
  const collection = args.collection || env.QDRANT_COLLECTION_CASE_RECALL || "hk_case_recall_openrouter_2048";
  const payload = JSON.parse(fs.readFileSync(args.input, "utf8"));
  const cards = payload.case_recall_cards || [];
  const points = [];

  for (const card of cards) {
    const text = [
      card.case_name,
      card.neutral_citation,
      card.court_level,
      card.judgment_date_text,
      ...(card.issue_tags || []),
      ...(card.criminal_signals || []),
      card.indexed_text_preview,
    ].filter(Boolean).join("\n");
    const vector = await embed(text, env, dimension);
    points.push({
      id: uuidFromText(card.recall_card_id || card.source_id),
      vector,
      payload: {
        source_id: card.source_id,
        case_id: card.case_id,
        recall_card_id: card.recall_card_id,
        source_type: "case_recall",
        source_kind: "case_judgment",
        source_provider: card.source_provider,
        evidence_level: "case_recall_only",
        domain_id: "criminal_law_hk",
        practice_area: "criminal_law",
        source_visibility: "public_demo",
        tenant_id: "public",
        answer_layer_status: "case_recall_only",
        review_status: "citation_verified_public_source",
        answer_safe: false,
        dis: card.dis,
        title: card.case_name,
        citation: card.neutral_citation,
        court_level: card.court_level,
        judgment_date_text: card.judgment_date_text,
        issue_tags: card.issue_tags || [],
        criminal_likely: card.criminal_likely,
        criminal_signals: card.criminal_signals || [],
        source_url: card.source_url_or_path,
        fetch_url: card.fetch_url,
        hklii_url: card.hklii_url,
        hklii_crosscheck_status: card.hklii_crosscheck_status,
        hklii_paragraph_url_count: card.hklii_paragraph_url_count || 0,
        indexed_text_preview: String(card.indexed_text_preview || "").slice(0, 900),
      },
    });
  }

  if (args.dryRun) {
    console.log(JSON.stringify({
      input: path.relative(ROOT, args.input),
      collection,
      provider,
      dimension,
      point_count: points.length,
      status: "dry_run_no_qdrant_write",
    }, null, 2));
    return;
  }

  const collectionStatus = await ensureCollection(env, collection, dimension);
  for (let i = 0; i < points.length; i += 128) {
    await qdrantRequest(env, `/collections/${encodeURIComponent(collection)}/points?wait=true`, {
      method: "PUT",
      body: { points: points.slice(i, i + 128) },
    });
  }

  console.log(JSON.stringify({
    input: path.relative(ROOT, args.input),
    collection,
    collection_status: collectionStatus,
    point_count: points.length,
    status: "indexed",
  }, null, 2));
}

main().catch(error => {
  console.error(error.message);
  if (error.payload) console.error(JSON.stringify(error.payload, null, 2));
  process.exit(1);
});
