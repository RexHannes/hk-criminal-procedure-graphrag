#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const BATCH_DIR = path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "bail_public_batch_v1");

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

function headers(env) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    Accept: "application/json",
  };
}

async function supabaseGet(env, table, query) {
  const base = String(env.SUPABASE_URL || "").replace(/\/$/, "");
  if (!base || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
  const url = new URL(`/rest/v1/${table}`, base);
  Object.entries(query || {}).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, { headers: headers(env) });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(`Supabase HTTP ${response.status} ${table}`);
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function qdrantRequest(env, collection, body) {
  const base = String(env.QDRANT_URL || "").replace(/\/$/, "");
  if (!base) throw new Error("QDRANT_URL required");
  const headers = { "Content-Type": "application/json" };
  if (env.QDRANT_API_KEY) headers["api-key"] = env.QDRANT_API_KEY;
  const response = await fetch(`${base}/collections/${encodeURIComponent(collection)}/points/scroll`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(`Qdrant HTTP ${response.status} ${collection}`);
    error.payload = payload;
    throw error;
  }
  return payload;
}

function mustMatch(key, value) {
  return { key, match: { value } };
}

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

async function validateSupabase(env, artifacts, errors) {
  const sourceIds = artifacts.cases.map(item => item.case_id);
  const paragraphIds = artifacts.paragraphs.map(item => item.paragraph_id);
  const propositionIds = artifacts.propositions.map(item => item.proposition_id);
  const caseRows = [];
  const paragraphRows = [];
  const propositionRows = [];
  const reviewRows = [];
  for (const id of sourceIds) {
    const rows = await supabaseGet(env, "legal_cases", { id: `eq.${id}`, select: "id,title_en,neutral_citation,legal_domain,review_status" });
    caseRows.push(...rows);
  }
  for (const id of paragraphIds) {
    const rows = await supabaseGet(env, "legal_paragraphs", { id: `eq.${id}`, select: "id,case_id,para_no,text,review_status" });
    paragraphRows.push(...rows);
  }
  for (const id of propositionIds) {
    const rows = await supabaseGet(env, "proposition_cards", { id: `eq.${id}`, select: "id,case_id,canonical_para_id,proposition_text,review_status,issue_tags,doctrine_tags" });
    propositionRows.push(...rows);
  }
  for (const id of propositionIds) {
    const rows = await supabaseGet(env, "human_review_items", { item_id: `eq.${id}`, select: "item_id,status,payload_json" });
    reviewRows.push(...rows);
  }
  const paragraphById = new Map(paragraphRows.map(item => [item.id, item]));
  const reviewById = new Map(reviewRows.map(item => [item.item_id, item]));
  assert(caseRows.length === artifacts.cases.length, `Supabase cases ${caseRows.length} != ${artifacts.cases.length}`, errors);
  assert(paragraphRows.length === artifacts.paragraphs.length, `Supabase paragraphs ${paragraphRows.length} != ${artifacts.paragraphs.length}`, errors);
  assert(propositionRows.length === artifacts.propositions.length, `Supabase propositions ${propositionRows.length} != ${artifacts.propositions.length}`, errors);
  assert(reviewRows.length === artifacts.propositions.length, `Supabase review items ${reviewRows.length} != ${artifacts.propositions.length}`, errors);
  for (const card of artifacts.propositions) {
    const paragraph = paragraphById.get(card.paragraph_id);
    const review = reviewById.get(card.proposition_id);
    assert(paragraph && paragraph.text.includes(card.exact_quote), `${card.proposition_id}: remote paragraph missing exact quote`, errors);
    assert(review?.status === "open", `${card.proposition_id}: review item should remain open`, errors);
    assert(review?.payload_json?.promote_answer_safe === false, `${card.proposition_id}: review payload must not promote answer_safe`, errors);
    assert(review?.payload_json?.exact_quote === card.exact_quote, `${card.proposition_id}: remote review payload exact quote mismatch`, errors);
  }
  for (const row of propositionRows) {
    assert(row.review_status !== "answer_safe" && row.review_status !== "approved", `${row.id}: proposition must not be answer_safe/approved`, errors);
    assert(JSON.stringify(row).includes("criminal_procedure_hk"), `${row.id}: missing criminal procedure doctrine tags`, errors);
  }
  return { cases: caseRows.length, paragraphs: paragraphRows.length, propositions: propositionRows.length, review_items: reviewRows.length };
}

async function validateQdrant(env, artifacts, errors) {
  const collections = {
    paragraphs: env.QDRANT_COLLECTION_PARAGRAPHS || "hk_legal_paragraphs",
    propositions: env.QDRANT_COLLECTION_PROPOSITIONS || "hk_proposition_cards",
  };
  const baseFilter = {
    must: [
      mustMatch("batch_id", artifacts.manifest.batch_id),
      mustMatch("source_visibility", "public_demo"),
      mustMatch("tenant_id", "public"),
      mustMatch("vector_scope", "bail_public_batch_v1"),
      mustMatch("answer_layer_status", "candidate_only"),
    ],
  };
  const [paragraphPayload, propositionPayload] = await Promise.all([
    qdrantRequest(env, collections.paragraphs, { filter: baseFilter, limit: 100, with_payload: true, with_vector: false }),
    qdrantRequest(env, collections.propositions, { filter: baseFilter, limit: 100, with_payload: true, with_vector: false }),
  ]);
  const paragraphPoints = paragraphPayload.result?.points || [];
  const propositionPoints = propositionPayload.result?.points || [];
  assert(paragraphPoints.length === artifacts.paragraphs.length, `Qdrant paragraph points ${paragraphPoints.length} != ${artifacts.paragraphs.length}`, errors);
  assert(propositionPoints.length === artifacts.propositions.length, `Qdrant proposition points ${propositionPoints.length} != ${artifacts.propositions.length}`, errors);
  for (const point of [...paragraphPoints, ...propositionPoints]) {
    const payload = point.payload || {};
    assert(payload.practice_area === "criminal_procedure", `${point.id}: wrong practice_area`, errors);
    assert(payload.visibility === "public_source", `${point.id}: wrong visibility`, errors);
    assert(payload.review_status === "machine_candidate", `${point.id}: wrong review_status`, errors);
    assert(payload.embedding_provider, `${point.id}: missing embedding_provider`, errors);
    assert(payload.embedding_model, `${point.id}: missing embedding_model`, errors);
    assert(payload.tokenizer_version, `${point.id}: missing tokenizer_version`, errors);
    assert(!JSON.stringify(payload).toLowerCase().includes("private"), `${point.id}: private marker leaked into public payload`, errors);
  }
  return { paragraph_points: paragraphPoints.length, proposition_points: propositionPoints.length };
}

async function main() {
  const env = loadEnv();
  const manifest = readJson(path.join(BATCH_DIR, "source_manifest.json"));
  const paragraphPayload = readJson(path.join(BATCH_DIR, "paragraph_cards.json"));
  const propositionPayload = readJson(path.join(BATCH_DIR, "proposition_cards.json"));
  const artifacts = {
    manifest,
    cases: paragraphPayload.cases || [],
    paragraphs: paragraphPayload.paragraph_cards || [],
    propositions: propositionPayload.proposition_cards || [],
  };
  const errors = [];
  const supabase = await validateSupabase(env, artifacts, errors);
  const qdrant = await validateQdrant(env, artifacts, errors);
  const report = {
    validator: "public_bail_backend_storage_v1",
    batch_id: manifest.batch_id,
    supabase,
    qdrant,
    status: errors.length ? "failed" : "passed",
    errors,
  };
  console.log(JSON.stringify(report, null, 2));
  if (errors.length) process.exit(1);
}

main().catch(error => {
  console.error(error.message);
  if (error.payload) console.error(JSON.stringify(error.payload, null, 2));
  process.exit(1);
});
