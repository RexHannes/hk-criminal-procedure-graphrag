#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_BUCKETS = [
  "legal-private-vault",
  "legal-public-sources",
  "legal-parsed-artifacts",
];

const REQUIRED_TABLES = [
  "source_registry",
  "legal_paragraphs",
  "proposition_cards",
  "form_metadata",
  "answer_contracts",
  "human_review_queue",
  "eval_runs",
  "legal_ingest_runs",
  "legal_chunks",
  "vector_index_manifests",
  "retrieval_eval_cases",
];

const UPSERTS = [
  ["source_registry", "source_id", "source_registry"],
  ["legal_paragraphs", "paragraph_id", "legal_paragraphs"],
  ["proposition_cards", "proposition_id", "proposition_cards"],
  ["form_metadata", "form_id", "form_metadata"],
  ["answer_contracts", "contract_id", "answer_contracts"],
  ["human_review_queue", "review_item_id", "human_review_queue"],
  ["eval_runs", "eval_id", "eval_runs"],
];

const MIGRATION_FILES = [
  "20260611000000_create_legal_ingest_core_tables.sql",
  "20260611001000_create_legal_storage_buckets.sql",
  "20260612000000_create_proposition_node_links.sql",
  "20260615000000_create_legal_rag_pipeline_tables.sql",
];

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
  const fileEnv = {
    ...parseEnvFile(path.join(ROOT, ".env")),
    ...parseEnvFile(path.join(ROOT, ".env.local")),
  };
  return { ...fileEnv, ...process.env };
}

function requiredEnv(env, key) {
  const value = String(env[key] || "").trim().replace(/\/$/, "");
  if (!value) throw new Error(`Missing ${key}. Fill .env.local or export it before running this setup.`);
  return value;
}

function migrationPaths() {
  return MIGRATION_FILES.map((file) => path.join(ROOT, "supabase", "migrations", file));
}

function applyMigrations(env) {
  const dbUrl = String(env.SUPABASE_DB_URL || env.DATABASE_URL || "").trim().replace(/^['"]|['"]$/g, "");
  if (!dbUrl) {
    throw new Error("Missing SUPABASE_DB_URL or DATABASE_URL for --apply-migrations.");
  }
  for (const filePath of migrationPaths()) {
    if (!fs.existsSync(filePath)) throw new Error(`Missing migration file: ${filePath}`);
    console.log(`- applying ${path.basename(filePath)}`);
    const result = spawnSync("psql", ["--set", "ON_ERROR_STOP=1", "--dbname", dbUrl, "--file", filePath], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (result.error && result.error.code === "ENOENT") {
      throw new Error("psql is not installed or not in PATH. Install psql or apply the SQL files via Supabase SQL editor.");
    }
    if (result.status !== 0) {
      throw new Error(`Migration failed for ${path.basename(filePath)}:\n${result.stderr || result.stdout}`);
    }
  }
}

function headers(serviceRoleKey, extra = {}) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function request({ supabaseUrl, serviceRoleKey, pathAndQuery, method = "GET", body, ok = [200, 201, 204] }) {
  const response = await fetch(`${supabaseUrl}${pathAndQuery}`, {
    method,
    headers: headers(serviceRoleKey),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  if (!ok.includes(response.status)) {
    const error = new Error(`HTTP ${response.status} ${method} ${pathAndQuery}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function ensureBucket(ctx, bucketId) {
  try {
    await request({ ...ctx, pathAndQuery: `/storage/v1/bucket/${encodeURIComponent(bucketId)}` });
    return { bucket: bucketId, status: "exists" };
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  await request({
    ...ctx,
    pathAndQuery: "/storage/v1/bucket",
    method: "POST",
    ok: [200, 201],
    body: {
      id: bucketId,
      name: bucketId,
      public: false,
      file_size_limit: 524288000,
    },
  });
  return { bucket: bucketId, status: "created_private" };
}

async function checkTable(ctx, table) {
  try {
    await request({
      ...ctx,
      pathAndQuery: `/rest/v1/${table}?select=*&limit=1`,
      ok: [200, 206],
    });
    return { table, status: "ok" };
  } catch (error) {
    return {
      table,
      status: "missing_or_inaccessible",
      error: error.message,
      details: error.payload,
    };
  }
}

function loadVertical() {
  const verticalPath = path.join(ROOT, "data", "legal_ingest", "verticals", "inconsistent_pleadings.json");
  const vertical = JSON.parse(fs.readFileSync(verticalPath, "utf8"));
  if (!vertical.vertical_id) throw new Error("Vertical is missing vertical_id");
  return vertical;
}

function assertQuoteValidation(vertical) {
  const paragraphs = new Map(vertical.legal_paragraphs.map((p) => [p.paragraph_id, p.paragraph_text || ""]));
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
  if (errors.length) throw new Error(`Quote validation failed:\n- ${errors.join("\n- ")}`);
}

function addDerivedIds(vertical) {
  return {
    ...vertical,
    answer_contracts: (vertical.answer_contracts || []).map((contract, index) => ({
      contract_id: `${vertical.vertical_id}_contract_${index + 1}`,
      ...contract,
    })),
  };
}

async function upsertRows(ctx, table, conflictKey, rows) {
  if (!rows || rows.length === 0) return { table, count: 0, status: "skipped_empty" };
  await request({
    ...ctx,
    pathAndQuery: `/rest/v1/${table}?on_conflict=${encodeURIComponent(conflictKey)}`,
    method: "POST",
    ok: [200, 201],
    body: rows,
  });
  return { table, count: rows.length, status: "upserted" };
}

async function seedVertical(ctx) {
  const vertical = addDerivedIds(loadVertical());
  assertQuoteValidation(vertical);
  const results = [];
  for (const [table, conflictKey, verticalKey] of UPSERTS) {
    results.push(await upsertRows(ctx, table, conflictKey, vertical[verticalKey] || []));
  }
  return results;
}

async function main() {
  const env = loadEnv();
  const shouldApplyMigrations = process.argv.includes("--apply-migrations");
  const shouldSeed = process.argv.includes("--seed-inconsistent");

  if (shouldApplyMigrations) {
    console.log("0. Applying Supabase migrations");
    applyMigrations(env);
  }

  const supabaseUrl = requiredEnv(env, "SUPABASE_URL");
  const serviceRoleKey = requiredEnv(env, "SUPABASE_SERVICE_ROLE_KEY");
  const ctx = { supabaseUrl, serviceRoleKey };

  console.log(`Supabase project: ${new URL(supabaseUrl).host}`);

  console.log("\n1. Ensuring private storage buckets");
  for (const bucket of DEFAULT_BUCKETS) {
    const result = await ensureBucket(ctx, bucket);
    console.log(`- ${result.bucket}: ${result.status}`);
  }

  console.log("\n2. Verifying legal ingest tables");
  const tableResults = [];
  for (const table of REQUIRED_TABLES) {
    const result = await checkTable(ctx, table);
    tableResults.push(result);
    console.log(`- ${table}: ${result.status}`);
  }
  const missing = tableResults.filter((result) => result.status !== "ok");
  if (missing.length) {
    console.log("\nRemote migrations are not fully applied yet.");
    console.log("Apply the committed SQL files in supabase/migrations to the Supabase database, then rerun this script.");
    process.exitCode = 2;
    return;
  }

  if (!shouldSeed) {
    console.log("\n3. Seed skipped. Rerun with --seed-inconsistent to ingest the public-case vertical.");
    return;
  }

  console.log("\n3. Seeding inconsistent pleadings public-case vertical");
  const seedResults = await seedVertical(ctx);
  for (const result of seedResults) {
    console.log(`- ${result.table}: ${result.status} (${result.count})`);
  }
  console.log("\nDone. Cards remain research_only / lawyer_review_required until reviewed.");
}

main().catch((error) => {
  console.error(error.message);
  if (error.payload) console.error(JSON.stringify(error.payload, null, 2));
  process.exit(1);
});
