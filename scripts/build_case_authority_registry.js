#!/usr/bin/env node
const { buildCaseAuthorityRegistry, REGISTRY_PATH } = require("../src/case_graph/case_authority_bridge");

const payload = buildCaseAuthorityRegistry({ write: true });
console.log(JSON.stringify({
  ok: true,
  registry_path: REGISTRY_PATH,
  entry_count: payload.entry_count,
  case_seed_count: payload.case_seed_count,
  sample_nodes: Object.keys(payload.entries).slice(0, 8),
}, null, 2));
