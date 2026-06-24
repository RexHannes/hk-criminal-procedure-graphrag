#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const QUEUE_PATH = path.join(ROOT, "data", "legal_ingest", "tree_expansion", "notebooklm_field_expansion_queue.json");
const WORKFLOW_PATH = path.join(ROOT, "data", "legal_ingest", "tree_expansion", "notebooklm_field_expansion_workflow.json");
const INDEX_PATH = path.join(ROOT, "data", "index.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function pushIf(errors, condition, message) {
  if (condition) errors.push(message);
}

function walkStrings(value, visitor, pathParts = []) {
  if (typeof value === "string") {
    visitor(value, pathParts.join("."));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkStrings(item, visitor, pathParts.concat(String(index))));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      walkStrings(child, visitor, pathParts.concat(key));
    }
  }
}

function validate() {
  const errors = [];
  const queue = readJson(QUEUE_PATH);
  const workflow = readJson(WORKFLOW_PATH);
  const index = readJson(INDEX_PATH);

  const domainIds = new Set((index.domains || []).map(domain => domain.domain_id));
  const fields = Array.isArray(queue.fields) ? queue.fields : [];
  const target = queue.field_count_target || {};

  pushIf(errors, queue.status !== "candidate_only_requires_notebooklm_and_public_source_verification", "queue status must stay candidate-only");
  pushIf(errors, queue.source_basis?.private_source_text_retained !== false, "source_basis.private_source_text_retained must be false");
  pushIf(errors, fields.length < Number(target.min || 30), `field count ${fields.length} below target minimum`);
  pushIf(errors, fields.length > Number(target.max || 40), `field count ${fields.length} above target maximum`);

  const seenFieldIds = new Set();
  for (const [index, field] of fields.entries()) {
    const prefix = `fields[${index}]`;
    pushIf(errors, !field.field_id, `${prefix} missing field_id`);
    pushIf(errors, seenFieldIds.has(field.field_id), `${prefix} duplicate field_id ${field.field_id}`);
    seenFieldIds.add(field.field_id);

    pushIf(errors, !field.field_label, `${prefix} missing field_label`);
    pushIf(errors, typeof field.priority !== "number", `${prefix} priority must be numeric`);
    pushIf(errors, !["new_domain_pack_candidate", "branch_candidate"].includes(field.domain_action), `${prefix} has invalid domain_action`);
    pushIf(errors, !Array.isArray(field.top_principles) || field.top_principles.length < 5, `${prefix} needs at least 5 top_principles`);
    pushIf(errors, !Array.isArray(field.routing_keywords) || field.routing_keywords.length < 3, `${prefix} needs at least 3 routing_keywords`);
    pushIf(errors, !Array.isArray(field.exclusion_keywords), `${prefix} missing exclusion_keywords`);
    pushIf(errors, !Array.isArray(field.forbidden_neighbor_domains), `${prefix} missing forbidden_neighbor_domains`);
    pushIf(errors, !field.notebooklm_status || !field.notebooklm_status.includes("pending"), `${prefix} must remain pending NotebookLM branch fill`);
    pushIf(errors, !field.public_source_status, `${prefix} missing public_source_status`);

    if (field.parent_domain_if_existing) {
      const parentKnown = domainIds.has(field.parent_domain_if_existing) || seenFieldIds.has(field.parent_domain_if_existing);
      pushIf(errors, !parentKnown, `${prefix} parent_domain_if_existing not known: ${field.parent_domain_if_existing}`);
    }

    for (const forbidden of field.forbidden_neighbor_domains || []) {
      pushIf(errors, forbidden === field.field_id, `${prefix} forbids itself`);
    }
  }

  const existingPacks = Array.isArray(queue.existing_domain_packs) ? queue.existing_domain_packs : [];
  for (const pack of existingPacks) {
    pushIf(errors, !domainIds.has(pack), `existing_domain_pack not found in data/index.json: ${pack}`);
  }

  const hardGates = new Set(workflow.hard_gates || []);
  for (const gate of [
    "No NotebookLM output is authority.",
    "No DeepSeek output is authority.",
    "No private book excerpt may be committed.",
    "No proposition without exact public-source quote match.",
    "No answer_safe without explicit review approval.",
  ]) {
    pushIf(errors, !hardGates.has(gate), `workflow missing hard gate: ${gate}`);
  }

  walkStrings(queue, (text, location) => {
    pushIf(errors, /\banswer_safe\b/i.test(text) && !/answer_safe false|Keep answer_safe false|No answer_safe/.test(text), `unexpected answer_safe text at ${location}`);
    pushIf(errors, text.length > 700, `possible copied passage too long at ${location}`);
    pushIf(errors, /\bDear NotebookLM\b/.test(text), `raw prompt text should not be stored in queue at ${location}`);
  });

  return { errors, fields: fields.length, existingPacks: existingPacks.length };
}

const result = validate();
if (result.errors.length) {
  console.error(JSON.stringify({
    validator: "notebooklm_field_expansion_queue_v1",
    status: "failed",
    errors: result.errors,
  }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  validator: "notebooklm_field_expansion_queue_v1",
  status: "passed",
  fields: result.fields,
  existing_domain_packs: result.existingPacks,
}, null, 2));
