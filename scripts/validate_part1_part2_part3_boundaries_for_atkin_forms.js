#!/usr/bin/env node
const fs = require("fs");
const { assert } = require("./forms_cli_common");

const formsReport = JSON.parse(fs.readFileSync("artifacts/forms_as_code_snippets_report.json", "utf8"));
const qdrant = formsReport.atkin_private_qdrant || {};
const crosscheck = formsReport.notebooklm_atkin_crosscheck || {};
const context = formsReport.private_forms_context_awareness || {};
assert(formsReport.privacy_status?.external_llm_private_content_sent === false, "Private content must not be sent to external LLMs");
assert(qdrant.enabled === true, "Atkin private Qdrant lane must be represented in final report");
assert(qdrant.private_collections_only === true, "Private Qdrant lane must use private collections only");
assert(qdrant.local_offline_embeddings_default === true, "Private Qdrant embeddings must default local/offline");
assert(qdrant.public_legal_collections_touched === false, "Private Qdrant must not touch public legal collections");
assert(crosscheck.notebooklm_runtime_engine === false, "NotebookLM must not be runtime engine");
assert(crosscheck.mismatches_auto_fixed === false, "NotebookLM mismatches must be report-only");
assert(context.part_1_public_authority_separate === true, "Part 1 must stay public-authority-only");
assert(context.part_2_private_forms_retrieval === true, "Part 2 private forms retrieval must be enabled");
assert(context.part_3_timeline_crm_rules === true, "Part 3 timeline/CRM rules must be enabled");
console.log("part1/part2/part3 atkin boundaries ok");
