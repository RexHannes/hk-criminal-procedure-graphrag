#!/usr/bin/env node
const path = require("path");
const { resolveAllVisibleCaseSources, VIEWER_EVIDENCE_INDEX_PATH } = require("../src/case_graph/verified_case_authority");

const result = resolveAllVisibleCaseSources({ write: true });
console.log(JSON.stringify({
  ok: true,
  path: VIEWER_EVIDENCE_INDEX_PATH,
  record_count: result.index.record_count,
  verified_case_seed_count: result.index.verified_case_seed_count,
  excluded_case_seed_count: result.index.excluded_case_seed_count,
}, null, 2));
