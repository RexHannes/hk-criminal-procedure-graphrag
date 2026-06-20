#!/usr/bin/env node
/* eslint-disable no-console */

const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { validateManifestScalePolicy } = require("../src/case_graph/build_public_bail_batch");

const ROOT = path.resolve(__dirname, "..");
const errors = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

try {
  validateManifestScalePolicy({
    source_policy: {
      public_sources_only: true,
      private_or_licensed_sources_allowed: false,
      raw_private_upload_allowed: false,
      bulk_auto_attach_allowed: false,
      answer_safe_by_default: false,
    },
    scale_policy: {
      max_sources_without_force: 50,
      large_cross_domain_crawl_allowed: false,
    },
    sources: [
      {
        source_id: "demo",
        source_visibility: "public_demo",
        tenant_id: "public",
        licence_status: "public_judgment",
        source_kind: "case_judgment",
        source_url_or_path: "https://legalref.judiciary.hk/example",
      },
    ],
  });
} catch (error) {
  errors.push(`valid manifest rejected: ${error.message}`);
}

try {
  validateManifestScalePolicy({
    source_policy: {
      public_sources_only: true,
      private_or_licensed_sources_allowed: true,
      raw_private_upload_allowed: false,
      bulk_auto_attach_allowed: false,
      answer_safe_by_default: false,
    },
    scale_policy: { large_cross_domain_crawl_allowed: false },
    sources: [],
  });
  errors.push("private/licensed manifest should fail");
} catch (error) {
  assert(error.message === "manifest_scale_policy_validation_failed", "manifest failure message expected");
}

const planPath = path.join(os.tmpdir(), `blocked-scale-plan-${Date.now()}.json`);
fs.writeFileSync(planPath, JSON.stringify({
  run_plan_id: "blocked_plan",
  readiness_status: "blocked_for_large_scale",
  status: "blocked_preflight_only",
  execution_allowed: false,
  blockers: ["production_embeddings_configured"],
  shards: [{ shard_id: "shard_0001", case_ordinal_start: 1, case_ordinal_end: 100, max_cases: 100 }],
}, null, 2));

const blocked = spawnSync(process.execPath, [
  path.join(ROOT, "scripts", "run_case_scale_shard.js"),
  "--plan",
  planPath,
  "--shard-id",
  "shard_0001",
], { encoding: "utf8" });
assert(blocked.status === 1, "blocked shard execution should exit 1");
assert(blocked.stdout.includes("blocked_by_scale_readiness"), "blocked shard output expected");

const preflight = spawnSync(process.execPath, [
  path.join(ROOT, "scripts", "run_case_scale_shard.js"),
  "--plan",
  planPath,
  "--shard-id",
  "shard_0001",
  "--preflight-only",
], { encoding: "utf8" });
assert(preflight.status === 0, "blocked preflight-only should exit 0");
assert(preflight.stdout.includes("blocked_by_scale_readiness"), "preflight should still report blocked");

fs.unlinkSync(planPath);

if (errors.length) {
  console.error("Scale runtime guard validation failed:");
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log("Scale runtime guard validation passed.");
