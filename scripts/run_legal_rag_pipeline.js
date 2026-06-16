#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const VERTICAL_PATH = path.join(ROOT, "data", "legal_ingest", "verticals", "inconsistent_pleadings.json");
const SETUP_SCRIPT = path.join(ROOT, "scripts", "setup_supabase_legal_ingest.js");

const BUCKETS = ["legal-private-vault", "legal-public-sources", "legal-parsed-artifacts"];

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

function projectRef(supabaseUrl) {
  try {
    const host = new URL(supabaseUrl).host;
    return host.endsWith(".supabase.co") ? host.split(".")[0] : host;
  } catch {
    return "unknown";
  }
}

function loadVertical() {
  const vertical = JSON.parse(fs.readFileSync(VERTICAL_PATH, "utf8"));
  if (!vertical.vertical_id) throw new Error("vertical missing vertical_id");
  return vertical;
}

function assertQuoteValidation(vertical) {
  const paragraphs = new Map((vertical.legal_paragraphs || []).map(p => [p.paragraph_id, p.paragraph_text || ""]));
  const errors = [];
  for (const card of vertical.proposition_cards || []) {
    const paragraph = paragraphs.get(card.paragraph_id) || "";
    if (!card.supporting_quote || !paragraph.includes(card.supporting_quote)) {
      errors.push(`${card.proposition_id}: supporting_quote not found in ${card.paragraph_id}`);
    }
    if (card.answer_layer_status === "answer_safe" && card.review_status !== "approved") {
      errors.push(`${card.proposition_id}: answer_safe requires approved review`);
    }
  }
  if (errors.length) throw new Error(`quote validation failed:\n- ${errors.join("\n- ")}`);
}

function headers(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };
}

async function request(ctx, pathAndQuery, { ok = [200, 201, 204, 206] } = {}) {
  const response = await fetch(`${ctx.supabaseUrl}${pathAndQuery}`, {
    headers: headers(ctx.serviceRoleKey),
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  if (!ok.includes(response.status)) {
    const err = new Error(`HTTP ${response.status} GET ${pathAndQuery}`);
    err.payload = payload;
    throw err;
  }
  return payload;
}

async function hasColumns(ctx, table, columns) {
  try {
    await request(ctx, `/rest/v1/${table}?select=${columns.map(encodeURIComponent).join(",")}&limit=1`);
    return true;
  } catch {
    return false;
  }
}

async function detectSchema(ctx) {
  const sourceCardReady = await Promise.all([
    hasColumns(ctx, "legal_paragraphs", ["paragraph_id", "source_id", "paragraph_text", "answer_layer_status"]),
    hasColumns(ctx, "proposition_cards", ["proposition_id", "source_id", "paragraph_id", "supporting_quote", "answer_layer_status"]),
    hasColumns(ctx, "human_review_queue", ["review_item_id", "item_id", "status"]),
  ]);
  if (sourceCardReady.every(Boolean)) return "source_card_v1";

  const legacyReady = await Promise.all([
    hasColumns(ctx, "source_documents", ["id", "source_type", "source_url", "sha256"]),
    hasColumns(ctx, "legal_cases", ["id", "title_en", "source_document_id"]),
    hasColumns(ctx, "legal_paragraphs", ["id", "case_id", "para_no", "text"]),
    hasColumns(ctx, "proposition_cards", ["id", "case_id", "canonical_para_id", "proposition_text"]),
    hasColumns(ctx, "human_review_items", ["item_type", "item_id", "reason", "status"]),
  ]);
  if (legacyReady.every(Boolean)) return "legacy_case_schema";
  return "incompatible_or_missing";
}

async function countByKey(ctx, table, key, values) {
  let found = 0;
  for (const value of values) {
    const rows = await request(ctx, `/rest/v1/${table}?${key}=eq.${encodeURIComponent(value)}&select=${encodeURIComponent(key)}&limit=1`);
    if (Array.isArray(rows) && rows.length) found += 1;
  }
  return found;
}

async function verifyRemoteRows(ctx, vertical, schemaMode) {
  if (schemaMode === "source_card_v1") {
    return {
      source_registry: await countByKey(ctx, "source_registry", "source_id", vertical.source_registry.map(s => s.source_id)),
      legal_paragraphs: await countByKey(ctx, "legal_paragraphs", "paragraph_id", vertical.legal_paragraphs.map(p => p.paragraph_id)),
      proposition_cards: await countByKey(ctx, "proposition_cards", "proposition_id", vertical.proposition_cards.map(c => c.proposition_id)),
      form_metadata: await countByKey(ctx, "form_metadata", "form_id", vertical.form_metadata.map(f => f.form_id)),
      human_review_queue: await countByKey(ctx, "human_review_queue", "review_item_id", (vertical.human_review_queue || []).map(i => i.review_item_id)),
    };
  }
  if (schemaMode === "legacy_case_schema") {
    return {
      source_documents: await countByKey(ctx, "source_documents", "id", vertical.source_registry.map(s => s.source_id)),
      legal_cases: await countByKey(ctx, "legal_cases", "id", vertical.source_registry.map(s => s.source_id)),
      legal_paragraphs: await countByKey(ctx, "legal_paragraphs", "id", vertical.legal_paragraphs.map(p => p.paragraph_id)),
      proposition_cards: await countByKey(ctx, "proposition_cards", "id", vertical.proposition_cards.map(c => c.proposition_id)),
      human_review_items: await countByKey(ctx, "human_review_items", "item_id", (vertical.human_review_queue || []).map(i => i.item_id)),
    };
  }
  return {};
}

async function verifyAnswerMemoryTables(ctx) {
  const checks = {
    retrieval_bundles: ["bundle_id", "query_hash", "corpus_fingerprint", "retrieval_status"],
    legal_answer_snapshots: ["answer_id", "bundle_id", "source_fingerprint", "answer_status"],
    sop_playbooks: ["playbook_id", "domain", "source_fingerprint", "status"],
  };
  const result = {};
  for (const [table, columns] of Object.entries(checks)) {
    result[table] = await hasColumns(ctx, table, columns) ? "ok" : "missing_or_inaccessible";
  }
  return result;
}

async function verifyBuckets(ctx) {
  const result = {};
  for (const bucket of BUCKETS) {
    try {
      await request(ctx, `/storage/v1/bucket/${encodeURIComponent(bucket)}`);
      result[bucket] = "ok";
    } catch (error) {
      result[bucket] = `missing_or_inaccessible:${error.message}`;
    }
  }
  return result;
}

function runSeed(schemaMode) {
  const args = [SETUP_SCRIPT, "--seed-inconsistent"];
  if (schemaMode === "legacy_case_schema") args.push("--legacy-compatible-seed");
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function buildLocalStageReport(vertical) {
  return {
    source_governance: {
      source_records: vertical.source_registry.length,
      private_or_metadata_only: vertical.source_registry.every(s => s.storage_policy && s.license_status),
    },
    parsing_and_chunking: {
      paragraph_cards: vertical.legal_paragraphs.length,
      source_ids: Array.from(new Set(vertical.legal_paragraphs.map(p => p.source_id))).length,
    },
    proposition_extraction: {
      proposition_cards: vertical.proposition_cards.length,
      authority_roles: Array.from(new Set(vertical.proposition_cards.map(p => p.authority_role))).sort(),
    },
    validation: {
      quote_exact: true,
      answer_safe_cards: vertical.proposition_cards.filter(p => p.answer_layer_status === "answer_safe").length,
      review_required_cards: vertical.proposition_cards.filter(p => p.review_status !== "approved").length,
    },
    forms_and_documents: {
      form_candidates: vertical.form_metadata.length,
      candidate_only: vertical.form_metadata.every(f => f.output_mode !== "approved_template_lawyer_review_required"),
    },
    review_queue: {
      review_items: (vertical.human_review_queue || []).length,
    },
    answer_memory: {
      retrieval_bundles: "schema_required",
      legal_answer_snapshots: "schema_required",
      sop_playbooks: "schema_required",
      cache_policy: "reuse only while source fingerprint and review status remain valid",
    },
    evaluation: {
      eval_rows: (vertical.eval_runs || []).length,
    },
  };
}

function printStageReport(report) {
  console.log(JSON.stringify(report, null, 2));
}

async function main() {
  const env = loadEnv();
  const supabaseUrl = String(env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const shouldRemote = process.argv.includes("--remote");
  const shouldSeed = process.argv.includes("--seed");

  const vertical = loadVertical();
  assertQuoteValidation(vertical);

  const report = {
    pipeline: "legal_rag_pipeline_inconsistent_pleadings_v1",
    vertical_id: vertical.vertical_id,
    target: supabaseUrl ? { supabase_url: supabaseUrl, project_ref: projectRef(supabaseUrl) } : { supabase_url: "missing" },
    local: buildLocalStageReport(vertical),
    remote: null,
  };

  if (shouldRemote) {
    if (!supabaseUrl || !serviceRoleKey) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for --remote");
    const ctx = { supabaseUrl, serviceRoleKey };
    const schemaMode = await detectSchema(ctx);
    const buckets = await verifyBuckets(ctx);
    let seed = null;
    if (shouldSeed) seed = runSeed(schemaMode);
    report.remote = {
      schema_mode: schemaMode,
      buckets,
      seed,
      row_counts: await verifyRemoteRows(ctx, vertical, schemaMode),
      answer_memory_tables: await verifyAnswerMemoryTables(ctx),
      qdrant_indexing: {
        configured: Boolean(env.QDRANT_URL),
        status: env.QDRANT_URL ? "ready_for_indexer_adapter" : "manifest_only_no_qdrant_url",
      },
    };
    if (seed && !seed.ok) process.exitCode = seed.status || 1;
  }

  printStageReport(report);
}

main().catch(error => {
  console.error(error.message);
  if (error.payload) console.error(JSON.stringify(error.payload, null, 2));
  process.exit(1);
});
