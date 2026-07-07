#!/usr/bin/env node
const fs = require("fs");
const { assert } = require("./forms_cli_common");
const { loadFormStore } = require("../src/forms/form_system");
const { buildMatterDocumentFlowIndex, buildWorkflowTimelineRules } = require("../src/forms/form_to_workflow_mapper");

const rules = JSON.parse(fs.readFileSync("data/forms/default_document_flow_rules.json", "utf8"));
assert((rules.rules || []).some(rule => rule.documentIntent === "COMPANY_WINDING_UP_PETITION"), "Missing winding-up flow rule");
assert((rules.rules || []).some(rule => rule.documentIntent === "LETTER_OF_CLAIM"), "Missing PI letter flow rule");

const store = loadFormStore("fixtures/forms/private_lane_company_winding_up_store");
const flow = buildMatterDocumentFlowIndex(store);
const timeline = buildWorkflowTimelineRules(store);
assert(flow.privateTextCommitted === false, "Flow index must be metadata only");
assert(flow.flows.length >= 1, "Expected matter document flow records");
assert(flow.flows.some(item => item.documentIntent === "COMPANY_WINDING_UP_PETITION" && item.practiceLane === "company_winding_up"), "Winding-up template must map to winding-up lane");
assert(timeline.rules.length === flow.flows.length, "Timeline rules should align with flow records");
console.log("form-to-workflow mapping ok");
