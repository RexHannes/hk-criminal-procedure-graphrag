#!/usr/bin/env node
/* eslint-disable no-console */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const BATCH_DIR = path.join(
  ROOT,
  "data",
  "legal_ingest",
  "criminal_evidence_tree_v1",
  "bail_public_batch_v1",
);

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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function requestOnce(ctx, { pathAndQuery, method = "GET", body, ok = [200, 201, 204, 206], timeoutMs = 20000 }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`Supabase request timeout: ${method} ${pathAndQuery}`)), timeoutMs);
  let response;
  try {
    response = await fetch(`${ctx.supabaseUrl}/rest/v1/${pathAndQuery}`, {
      method,
      headers: {
        apikey: ctx.serviceRoleKey,
        Authorization: `Bearer ${ctx.serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: method === "POST" ? "resolution=merge-duplicates,return=minimal" : "return=minimal",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  if (!ok.includes(response.status)) {
    const err = new Error(`Supabase HTTP ${response.status} ${method} ${pathAndQuery}`);
    err.payload = payload;
    throw err;
  }
  return payload;
}

async function request(ctx, options) {
  let lastError = null;
  const retries = Number(ctx.retries ?? 2);
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await requestOnce(ctx, options);
    } catch (error) {
      lastError = error;
      if (attempt < retries) await wait(1000 * (attempt + 1));
    }
  }
  throw lastError;
}

async function patchOrInsert(ctx, table, filterColumn, row) {
  const value = row[filterColumn];
  const filter = `${filterColumn}=eq.${encodeURIComponent(value)}`;
  const existing = await request(ctx, {
    pathAndQuery: `${table}?${filter}&select=${encodeURIComponent(filterColumn)}&limit=1`,
  });
  if (Array.isArray(existing) && existing.length) {
    await request(ctx, {
      pathAndQuery: `${table}?${filter}`,
      method: "PATCH",
      body: row,
      ok: [200, 204],
    });
    return "updated";
  }
  await request(ctx, {
    pathAndQuery: table,
    method: "POST",
    body: row,
  });
  return "inserted";
}

function loadBatchArtifacts() {
  const manifest = readJson(path.join(BATCH_DIR, "source_manifest.json"));
  const paragraphPayload = readJson(path.join(BATCH_DIR, "paragraph_cards.json"));
  const propositionPayload = readJson(path.join(BATCH_DIR, "proposition_cards.json"));
  const linksPayload = readJson(path.join(BATCH_DIR, "proposition_node_links.json"));
  return {
    manifest,
    cases: paragraphPayload.cases || [],
    paragraphs: paragraphPayload.paragraph_cards || [],
    propositions: propositionPayload.proposition_cards || [],
    links: linksPayload.proposition_node_links || [],
  };
}

function assertQuoteIntegrity(paragraphs, propositions) {
  const paragraphById = new Map(paragraphs.map(item => [item.paragraph_id, item]));
  const errors = [];
  for (const card of propositions) {
    const paragraph = paragraphById.get(card.paragraph_id);
    if (!paragraph) errors.push(`${card.proposition_id}: missing paragraph ${card.paragraph_id}`);
    else if (!paragraph.text.includes(card.exact_quote)) {
      errors.push(`${card.proposition_id}: exact_quote not found in paragraph text`);
    }
    if (card.answer_safe === true || card.review_state === "answer_safe") {
      errors.push(`${card.proposition_id}: answer_safe promotion is blocked at seed time`);
    }
  }
  if (errors.length) throw new Error(`Quote validation failed:\n- ${errors.join("\n- ")}`);
}

function buildLegacyRows(batch) {
  const sourceRegistry = batch.manifest.sources.map(source => ({
    source_id: source.source_id,
    source_type: "case",
    title: source.case_name,
    jurisdiction: "Hong Kong",
    court: source.court_level || source.court || null,
    citation: source.neutral_citation,
    source_url: source.source_url_or_path,
    raw_file_uri: null,
    license_status: "public_judgment",
    storage_policy: "public_metadata_public_raw",
    checksum: sha256(`${source.source_id}:${source.neutral_citation}:${source.fetch_url || ""}`),
    ingest_status: "parsed",
    review_status: "lawyer_review_required",
    visibility: "public_source",
    rag_policy: {
      batch_id: batch.manifest.batch_id,
      source_visibility: "public_demo",
      tenant_id: "public",
      answer_safe_by_default: false,
      human_review_required: true,
    },
    notes: source.notes || "",
  }));

  const sourceDocuments = batch.manifest.sources.map(source => ({
    id: source.case_id,
    source_type: source.source_kind || "case_judgment",
    source_url: source.source_url_or_path,
    sha256: sha256(`${source.case_id}:${source.neutral_citation}:${source.fetch_url || ""}`),
    raw_text: null,
    parse_status: "parsed",
    rights_note: `${source.licence_status} · public_judgment · ${batch.manifest.batch_id}`,
  }));

  const legalCases = batch.cases.map(item => ({
    id: item.case_id,
    neutral_citation: item.neutral_citation,
    court: item.court,
    court_code: item.court_level,
    court_level: item.court_level,
    title_en: item.case_name,
    legal_domain: "criminal_procedure_hk",
    source_url: item.source_url_or_path,
    source_document_id: item.case_id,
    review_status: "lawyer_review_required",
    treatment_warnings: item.authority_status?.includes("later_considered")
      ? ["later_considered_in_lai_cfa"]
      : [],
    good_law_flags: [],
  }));

  const legalParagraphs = batch.paragraphs.map(paragraph => ({
    id: paragraph.paragraph_id,
    case_id: paragraph.case_id,
    para_no: paragraph.paragraph_no || "",
    heading_path: [],
    text: paragraph.text,
    role_label: "public_judgment_excerpt",
    proposition_type: null,
    source_url: paragraph.source_url,
    extractor_version: "public_bail_batch_v1",
    review_status: "quote_verified",
    treatment_warnings: [],
    good_law_flags: [],
  }));

  const propositionCards = batch.propositions.map(card => ({
    id: card.proposition_id,
    case_id: card.case_id,
    canonical_para_id: card.paragraph_id,
    proposition_text: card.proposition_text,
    proposition_type: card.authority_role || "applied_principle",
    issue_tags: card.target_doctrine_node_ids || [],
    doctrine_tags: card.tree_node_ids || [],
    confidence: card.confidence === "high" ? 0.88 : card.confidence === "medium" ? 0.65 : 0.35,
    extractor_version: "public_bail_batch_v1",
    review_status: "review_required",
    mentioned_cases: [],
    mentioned_statutes: [],
  }));

  const humanReviewItems = batch.propositions.map(card => ({
    item_type: "proposition_card",
    item_id: card.proposition_id,
    reason: `Review public bail batch ${card.proposition_id}: ${card.proposition_text}`,
    payload_json: {
      batch_id: batch.manifest.batch_id,
      neutral_citation: batch.cases.find(item => item.case_id === card.case_id)?.neutral_citation || "",
      exact_quote: card.exact_quote,
      target_doctrine_node_ids: card.target_doctrine_node_ids || [],
      lineage_note: card.lineage_note || "",
      promote_answer_safe: false,
      source_url: card.source_url,
    },
    status: "open",
  }));

  const propositionNodeLinks = batch.links.map(link => ({
    proposition_id: link.proposition_id,
    doctrine_node_id: link.doctrine_node_id,
    link_type: link.link_type || "candidate",
    confidence: typeof link.confidence === "number" ? link.confidence : 0.65,
    linking_method: link.linking_method || "public_bail_batch_exact_quote_rules_v1",
    linking_notes: JSON.stringify({
      notes: link.notes || "",
      answer_layer_status: "candidate_only",
      human_review_required: true,
      source_visibility: link.source_visibility || "public_demo",
      guardrails: ["criminal_domain_only", "paragraph_backed", "not_answer_safe"],
    }),
    review_status: "machine_candidate",
  }));

  return {
    sourceRegistry,
    sourceDocuments,
    legalCases,
    legalParagraphs,
    propositionCards,
    humanReviewItems,
    propositionNodeLinks,
  };
}

async function seedBatch(ctx, { dryRun = false } = {}) {
  const batch = loadBatchArtifacts();
  assertQuoteIntegrity(batch.paragraphs, batch.propositions);
  const rows = buildLegacyRows(batch);
  const report = {
    batch_id: batch.manifest.batch_id,
    dry_run: dryRun,
    counts: {
      source_documents: rows.sourceDocuments.length,
      source_registry: rows.sourceRegistry.length,
      legal_cases: rows.legalCases.length,
      legal_paragraphs: rows.legalParagraphs.length,
      proposition_cards: rows.propositionCards.length,
      human_review_items: rows.humanReviewItems.length,
      proposition_node_links: rows.propositionNodeLinks.length,
    },
    review_policy: "machine_candidate_only_no_answer_safe_promotion",
  };

  if (dryRun) {
    report.status = "dry_run_ready";
    console.log(JSON.stringify(report, null, 2));
    return report;
  }

  const results = {};
  async function runRows(label, rowsForTable, fn) {
    console.error(`Seeding ${label}: ${rowsForTable.length} rows`);
    let index = 0;
    for (const row of rowsForTable) {
      index += 1;
      await fn(row);
      if (index === rowsForTable.length || index % 25 === 0) {
        console.error(`  ${label}: ${index}/${rowsForTable.length}`);
      }
    }
  }
  await runRows("source_registry", rows.sourceRegistry, async row => {
    try {
      results[`source_registry:${row.source_id}`] = await patchOrInsert(ctx, "source_registry", "source_id", row);
    } catch (error) {
      results[`source_registry:${row.source_id}`] = `skipped:${error.message}`;
    }
  });
  await runRows("source_documents", rows.sourceDocuments, async row => {
    results[`source_documents:${row.id}`] = await patchOrInsert(ctx, "source_documents", "id", row);
  });
  await runRows("legal_cases", rows.legalCases, async row => {
    results[`legal_cases:${row.id}`] = await patchOrInsert(ctx, "legal_cases", "id", row);
  });
  await runRows("legal_paragraphs", rows.legalParagraphs, async row => {
    results[`legal_paragraphs:${row.id}`] = await patchOrInsert(ctx, "legal_paragraphs", "id", row);
  });
  await runRows("proposition_cards", rows.propositionCards, async row => {
    results[`proposition_cards:${row.id}`] = await patchOrInsert(ctx, "proposition_cards", "id", row);
  });
  await runRows("human_review_items", rows.humanReviewItems, async row => {
    results[`human_review_items:${row.item_id}`] = await patchOrInsert(ctx, "human_review_items", "item_id", row);
  });
  await runRows("proposition_node_links", rows.propositionNodeLinks, async row => {
    const filter = [
      `proposition_id=eq.${encodeURIComponent(row.proposition_id)}`,
      `doctrine_node_id=eq.${encodeURIComponent(row.doctrine_node_id)}`,
      `link_type=eq.${encodeURIComponent(row.link_type)}`,
    ].join("&");
    const existing = await request(ctx, {
      pathAndQuery: `proposition_node_links?${filter}&select=id&limit=1`,
    });
    if (Array.isArray(existing) && existing.length) {
      await request(ctx, {
        pathAndQuery: `proposition_node_links?${filter}`,
        method: "PATCH",
        body: row,
        ok: [200, 204],
      });
      results[`proposition_node_links:${row.proposition_id}:${row.doctrine_node_id}`] = "updated";
    } else {
      await request(ctx, {
        pathAndQuery: "proposition_node_links",
        method: "POST",
        body: row,
      });
      results[`proposition_node_links:${row.proposition_id}:${row.doctrine_node_id}`] = "inserted";
    }
  });

  report.status = "seeded";
  report.results = results;
  console.log(JSON.stringify(report, null, 2));
  return report;
}

async function main() {
  const env = loadEnv();
  const dryRun = process.argv.includes("--dry-run");
  const supabaseUrl = String(env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  }
  await seedBatch({ supabaseUrl, serviceRoleKey, retries: 2 }, { dryRun });
}

main().catch(error => {
  console.error(error.message);
  if (error.payload) console.error(JSON.stringify(error.payload, null, 2));
  process.exit(1);
});
