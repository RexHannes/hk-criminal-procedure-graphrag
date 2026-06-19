#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SUITE_PATH = path.join(ROOT, "data", "legal_ingest", "mvp", "golden_queries_criminal_v1.json");

const suite = JSON.parse(fs.readFileSync(SUITE_PATH, "utf8"));
const errors = [];
const topics = new Set();

for (const query of suite.queries || []) {
  if (!query.id) errors.push("query missing id");
  if (!query.topic) errors.push(`${query.id}: missing topic`);
  if (!query.query) errors.push(`${query.id}: missing query`);
  if (!["answer_with_citations", "cannot_verify"].includes(query.expected_behavior)) errors.push(`${query.id}: invalid expected_behavior`);
  if (!query.required_source_kind) errors.push(`${query.id}: required_source_kind missing`);
  if (!Array.isArray(query.must_not_contain)) errors.push(`${query.id}: must_not_contain must be array`);
  topics.add(query.topic);
}

if ((suite.queries || []).length < 50) errors.push("criminal golden suite must contain at least 50 queries");
for (const topic of ["pleadings", "burden_standard", "confession", "identification", "hearsay", "similar_fact", "right_to_silence", "bail_procedure", "abuse_of_process", "appeal_review"]) {
  if (!topics.has(topic)) errors.push(`missing topic ${topic}`);
}

if (errors.length) {
  console.error("Criminal golden query suite validation failed:");
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`Criminal golden query suite validation passed (${suite.queries.length} queries).`);
