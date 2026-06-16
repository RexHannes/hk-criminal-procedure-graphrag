#!/usr/bin/env node
/* Validate legal answer cache read/write behavior for the source-card vertical. */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const [key, ...rest] = line.split("=");
    const value = rest.join("=").trim().replace(/^['"]|['"]$/g, "");
    if (value && !process.env[key.trim()]) process.env[key.trim()] = value;
  }
}

loadEnvFile(path.join(ROOT, ".env"));
loadEnvFile(path.join(ROOT, ".env.local"));

const handler = require("../api/search-evidence.js");

const QUERY = "What is the consequence for adducing inconsistent factual pleadings for the same Plaintiff across more than one case? Please elaborate on abuse of process, estoppel and collateral attack.";

function run(query) {
  return new Promise((resolve, reject) => {
    const req = { method: "GET", query: { q: query } };
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        if (this.statusCode >= 400) reject(new Error(`HTTP ${this.statusCode}`));
        else resolve(payload);
      },
    };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

(async () => {
  const errors = [];
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log("Legal answer cache API validation skipped: Supabase env not configured.");
    return;
  }

  const first = await run(QUERY);
  const second = await run(QUERY);
  const firstCache = first.legal_answer_cache || {};
  const secondCache = second.legal_answer_cache || {};

  assert(first.legal_ingest_vertical?.vertical_id === "inconsistent_pleadings_across_proceedings", "first call missing legal ingest vertical", errors);
  assert(second.legal_ingest_vertical?.vertical_id === "inconsistent_pleadings_across_proceedings", "second call missing legal ingest vertical", errors);
  assert(firstCache.answer_id, "first call missing cache answer id", errors);
  assert(secondCache.answer_id, "second call missing cache answer id", errors);
  assert(firstCache.answer_id === secondCache.answer_id, "cache answer id changed between identical calls", errors);
  assert(firstCache.bundle_id === secondCache.bundle_id, "cache bundle id changed between identical calls", errors);
  if (firstCache.write_status === "written") {
    assert(firstCache.playbook_id, "first cache write missing SOP playbook id", errors);
  }
  assert(["hit", "miss", "stale_or_blocked", "unavailable"].includes(firstCache.status), `unexpected first cache status ${firstCache.status}`, errors);
  assert(secondCache.status === "hit", `second call should hit cache, got ${secondCache.status}`, errors);
  assert(secondCache.answer_status !== "answer_safe" || secondCache.review_status === "approved", "answer_safe cache hit without approved review", errors);
  assert((second.source_backed_rules || []).length >= 5, "cached answer missing source-backed rules", errors);
  assert(second.source_audit?.display === "collapsed", "cached answer source audit should remain collapsed", errors);

  if (errors.length) {
    console.error("Legal answer cache API validation failed:");
    errors.forEach(error => console.error(`- ${error}`));
    console.error("First cache:", JSON.stringify(firstCache, null, 2));
    console.error("Second cache:", JSON.stringify(secondCache, null, 2));
    process.exit(1);
  }
  console.log("Legal answer cache API validation passed.");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
