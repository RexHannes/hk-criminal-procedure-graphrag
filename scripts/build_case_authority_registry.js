#!/usr/bin/env node
/* Build the unified case -> public paragraph authority registry. */

const path = require("path");
const {
  REGISTRY_PATH,
  writeCaseAuthorityRegistry,
} = require("../src/case_graph/case_authority_bridge");

const registry = writeCaseAuthorityRegistry();

console.log(`Wrote ${path.relative(process.cwd(), REGISTRY_PATH)}`);
console.log(JSON.stringify(registry.counts, null, 2));
