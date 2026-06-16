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

const LEGACY_CASE_TABLES = [
  "source_documents",
  "legal_cases",
  "legal_paragraphs",
  "proposition_cards",
  "human_review_items",
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

function cleanEnvValue(value) {
  return String(value || "").trim().replace(/^['"]|['"]$/g, "");
}

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
  const value = cleanEnvValue(env[key]).replace(/\/$/, "");
  if (!value) throw new Error(`Missing ${key}. Fill .env.local or export it before running this setup.`);
  return value;
}

function optionalEnv(env, key) {
  return cleanEnvValue(env[key]).replace(/\/$/, "");
}

function projectRefFromUrl(supabaseUrl) {
  try {
    const host = new URL(supabaseUrl).host;
    return host.endsWith(".supabase.co") ? host.split(".")[0] : host;
  } catch {
    return "unknown";
  }
}

function printTarget(env) {
  const supabaseUrl = optionalEnv(env, "SUPABASE_URL");
  console.log("Supabase target");
  if (!supabaseUrl) {
    console.log("- SUPABASE_URL: missing");
    return;
  }
  console.log(`- url: ${supabaseUrl}`);
  console.log(`- project_ref: ${projectRefFromUrl(supabaseUrl)}`);
  console.log(`- service_role_key: ${optionalEnv(env, "SUPABASE_SERVICE_ROLE_KEY") ? "present" : "missing"}`);
  console.log(`- db_url: ${optionalEnv(env, "SUPABASE_DB_URL") || optionalEnv(env, "DATABASE_URL") ? "present" : "missing"}`);
}

function migrationPaths() {
  return MIGRATION_FILES.map((file) => path.join(ROOT, "supabase", "migrations", file));
}

function applyMigrations(env) {
  const dbUrl = cleanEnvValue(env.SUPABASE_DB_URL || env.DATABASE_URL);
  if (!dbUrl) {
    throw new Error(
      "Missing SUPABASE_DB_URL or DATABASE_URL for --apply-migrations. " +
      "Use the Supabase dashboard database connection string for the target project, " +
      "or apply the SQL files in supabase/migrations through the Supabase SQL editor."
    );
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
      hint: table === "human_review_queue"
        ? "If Supabase mentions public.human_review_items, the remote database is on an older schema. Apply the committed legal-ingest migrations."
        : undefined,
    };
  }
}

async function tableHasColumns(ctx, table, columns) {
  try {
    await request({
      ...ctx,
      pathAndQuery: `/rest/v1/${table}?select=${columns.map(encodeURIComponent).join(",")}&limit=1`,
      ok: [200, 206],
    });
    return { table, columns, status: "ok" };
  } catch (error) {
    return {
      table,
      columns,
      status: "missing_columns_or_inaccessible",
      error: error.message,
      details: error.payload,
    };
  }
}

async function detectRemoteSchema(ctx) {
  const [
    sourceCardParagraphs,
    sourceCardPropositions,
    sourceCardReviewQueue,
    legacySources,
    legacyCases,
    legacyParagraphs,
    legacyPropositions,
    legacyReviewItems,
  ] = await Promise.all([
    tableHasColumns(ctx, "legal_paragraphs", ["paragraph_id", "source_id", "paragraph_text", "answer_layer_status"]),
    tableHasColumns(ctx, "proposition_cards", ["proposition_id", "source_id", "paragraph_id", "supporting_quote", "answer_layer_status"]),
    tableHasColumns(ctx, "human_review_queue", ["review_item_id", "item_id", "status"]),
    tableHasColumns(ctx, "source_documents", ["id", "source_type", "source_url", "sha256"]),
    tableHasColumns(ctx, "legal_cases", ["id", "title_en", "source_document_id"]),
    tableHasColumns(ctx, "legal_paragraphs", ["id", "case_id", "para_no", "text"]),
    tableHasColumns(ctx, "proposition_cards", ["id", "case_id", "canonical_para_id", "proposition_text"]),
    tableHasColumns(ctx, "human_review_items", ["item_type", "item_id", "reason", "status"]),
  ]);
  const sourceCardReady = [sourceCardParagraphs, sourceCardPropositions, sourceCardReviewQueue].every(result => result.status === "ok");
  const legacyReady = [legacySources, legacyCases, legacyParagraphs, legacyPropositions, legacyReviewItems].every(result => result.status === "ok");
  return {
    mode: sourceCardReady ? "source_card_v1" : legacyReady ? "legacy_case_schema" : "incompatible_or_missing",
    source_card_v1: [sourceCardParagraphs, sourceCardPropositions, sourceCardReviewQueue],
    legacy_case_schema: [legacySources, legacyCases, legacyParagraphs, legacyPropositions, legacyReviewItems],
  };
}

function printSchemaReport(report) {
  console.log("\nRemote schema compatibility");
  console.log(`- mode: ${report.mode}`);
  console.log("- source_card_v1:");
  for (const result of report.source_card_v1) {
    console.log(`  - ${result.table} [${result.columns.join(", ")}]: ${result.status}`);
  }
  console.log("- legacy_case_schema:");
  for (const result of report.legacy_case_schema) {
    console.log(`  - ${result.table} [${result.columns.join(", ")}]: ${result.status}`);
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

async function optionalUpsertRows(ctx, table, conflictKey, rows) {
  try {
    return await upsertRows(ctx, table, conflictKey, rows);
  } catch (error) {
    return {
      table,
      count: 0,
      status: "skipped_unavailable",
      error: error.message,
    };
  }
}

async function patchOrInsertRows(ctx, table, filterColumn, rows) {
  if (!rows || rows.length === 0) return { table, count: 0, status: "skipped_empty" };
  let count = 0;
  for (const row of rows) {
    const value = row[filterColumn];
    const filter = `${filterColumn}=eq.${encodeURIComponent(value)}`;
    const existing = await request({
      ...ctx,
      pathAndQuery: `/rest/v1/${table}?${filter}&select=${encodeURIComponent(filterColumn)}&limit=1`,
      ok: [200, 206],
    });
    if (Array.isArray(existing) && existing.length) {
      await request({
        ...ctx,
        pathAndQuery: `/rest/v1/${table}?${filter}`,
        method: "PATCH",
        body: row,
        ok: [200, 204],
      });
    } else {
      await request({
        ...ctx,
        pathAndQuery: `/rest/v1/${table}`,
        method: "POST",
        ok: [200, 201],
        body: row,
      });
    }
    count += 1;
  }
  return { table, count, status: "patched_or_inserted" };
}

function confidenceNumber(value) {
  if (typeof value === "number") return value;
  if (value === "high") return 0.85;
  if (value === "medium") return 0.65;
  if (value === "low") return 0.35;
  return 0.25;
}

function sourceById(vertical) {
  return new Map((vertical.source_registry || []).map(source => [source.source_id, source]));
}

function legacyRows(vertical) {
  const sources = sourceById(vertical);
  return {
    source_documents: (vertical.source_registry || []).map(source => ({
      id: source.source_id,
      source_type: source.source_type,
      source_url: source.source_url || null,
      sha256: source.checksum,
      raw_text: null,
      parse_status: "parsed",
      rights_note: [
        source.license_status,
        source.storage_policy,
        source.visibility,
      ].filter(Boolean).join(" · "),
    })),
    legal_cases: (vertical.source_registry || []).map(source => ({
      id: source.source_id,
      neutral_citation: source.citation || null,
      court: source.court || null,
      court_code: source.court || null,
      court_level: source.court || null,
      title_en: source.title,
      legal_domain: "hk",
      source_url: source.source_url || null,
      source_document_id: source.source_id,
      review_status: source.review_status || "lawyer_review_required",
      treatment_warnings: [],
      good_law_flags: [],
    })),
    legal_paragraphs: (vertical.legal_paragraphs || []).map(paragraph => {
      const source = sources.get(paragraph.source_id) || {};
      return {
        id: paragraph.paragraph_id,
        case_id: paragraph.source_id,
        para_no: paragraph.para_no || paragraph.pinpoint || "",
        heading_path: [],
        text: paragraph.paragraph_text,
        role_label: "source_card_excerpt",
        proposition_type: null,
        source_url: source.source_url || null,
        extractor_version: "legal_ingest_vertical_v1",
        review_status: paragraph.verification_status || "quote_verified",
        treatment_warnings: [],
        good_law_flags: [],
      };
    }),
    proposition_cards: (vertical.proposition_cards || []).map(card => ({
      id: card.proposition_id,
      case_id: card.source_id,
      canonical_para_id: card.paragraph_id,
      proposition_text: card.proposition_text,
      proposition_type: card.authority_role || "applied_principle",
      issue_tags: card.issue_tags || [],
      doctrine_tags: card.issue_tags || [],
      confidence: confidenceNumber(card.confidence),
      extractor_version: "legal_ingest_vertical_v1",
      review_status: card.review_status || "lawyer_review_required",
      mentioned_cases: card.citation ? [card.citation] : [],
      mentioned_statutes: [],
    })),
    human_review_items: (vertical.human_review_queue && vertical.human_review_queue.length
      ? vertical.human_review_queue
      : (vertical.proposition_cards || []).map(card => ({
          item_type: "proposition_card",
          item_id: card.proposition_id,
          reason: `Review ${card.citation || "source"} ${card.pinpoint || ""}: ${card.proposition_text}`,
          status: "open",
          priority: card.verification_status === "quote_verified" ? "normal" : "high",
        }))
    ).map(item => ({
      item_type: item.item_type || "proposition_card",
      item_id: item.item_id,
      reason: item.reason,
      payload_json: {
        vertical_id: vertical.vertical_id,
        review_item_id: item.review_item_id || `review_${item.item_id}`,
        priority: item.priority || "normal",
      },
      status: item.status || "open",
    })),
  };
}

async function seedLegacyVertical(ctx, vertical) {
  const rows = legacyRows(vertical);
  const results = [];
  results.push(await optionalUpsertRows(ctx, "source_registry", "source_id", vertical.source_registry || []));
  results.push(await patchOrInsertRows(ctx, "source_documents", "id", rows.source_documents));
  results.push(await patchOrInsertRows(ctx, "legal_cases", "id", rows.legal_cases));
  results.push(await patchOrInsertRows(ctx, "legal_paragraphs", "id", rows.legal_paragraphs));
  results.push(await patchOrInsertRows(ctx, "proposition_cards", "id", rows.proposition_cards));
  results.push(await optionalUpsertRows(ctx, "form_metadata", "form_id", vertical.form_metadata || []));
  results.push(await optionalUpsertRows(ctx, "answer_contracts", "contract_id", vertical.answer_contracts || []));
  results.push(await optionalUpsertRows(ctx, "eval_runs", "eval_id", vertical.eval_runs || []));
  results.push(await patchOrInsertRows(ctx, "human_review_items", "item_id", rows.human_review_items));
  return results;
}

async function seedVertical(ctx, mode = "source_card_v1") {
  const vertical = addDerivedIds(loadVertical());
  assertQuoteValidation(vertical);
  if (mode === "legacy_case_schema") {
    return seedLegacyVertical(ctx, vertical);
  }
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
  const shouldTargetOnly = process.argv.includes("--target");
  const shouldSchemaReportOnly = process.argv.includes("--schema-report");
  const allowLegacySeed = process.argv.includes("--legacy-compatible-seed");

  printTarget(env);
  if (shouldTargetOnly) return;

  if (shouldApplyMigrations) {
    console.log("\n0. Applying Supabase migrations");
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
  const schemaReport = await detectRemoteSchema(ctx);
  printSchemaReport(schemaReport);
  if (shouldSchemaReportOnly) return;

  const missing = tableResults.filter((result) => result.status !== "ok");
  if (missing.length) {
    if (shouldSeed && allowLegacySeed && schemaReport.mode === "legacy_case_schema") {
      console.log("\nRemote is using the older case/paragraph/proposition schema.");
      console.log("Proceeding with --legacy-compatible-seed mapping for the inconsistent-pleadings vertical.");
      const seedResults = await seedVertical(ctx, "legacy_case_schema");
      for (const result of seedResults) {
        console.log(`- ${result.table}: ${result.status} (${result.count})`);
      }
      console.log("\nDone. Legacy rows remain research_only / lawyer_review_required in product logic; no answer_safe promotion was performed.");
      return;
    }
    console.log("\nRemote migrations are not fully applied yet.");
    console.log("Apply the committed SQL files in supabase/migrations to the Supabase database, then rerun this script.");
    if (schemaReport.mode === "legacy_case_schema") {
      console.log("This project also supports the older case schema. To seed without changing that schema, rerun with:");
      console.log("node scripts/setup_supabase_legal_ingest.js --seed-inconsistent --legacy-compatible-seed");
    }
    process.exitCode = 2;
    return;
  }

  if (!shouldSeed) {
    console.log("\n3. Seed skipped. Rerun with --seed-inconsistent to ingest the public-case vertical.");
    return;
  }

  console.log("\n3. Seeding inconsistent pleadings public-case vertical");
  const seedResults = await seedVertical(ctx, schemaReport.mode);
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
