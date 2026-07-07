#!/usr/bin/env node
const fs = require("fs");
const { assert } = require("./forms_cli_common");
const { loadFormStore } = require("../src/forms/form_system");

const activation = JSON.parse(fs.readFileSync("artifacts/private_form_review_activation_report.json", "utf8"));
const lane = JSON.parse(fs.readFileSync("artifacts/private_form_lane_selection_report.json", "utf8"));
const store = loadFormStore("fixtures/forms/private_lane_company_winding_up_store");

assert(lane.selected_lane === "company_winding_up", "Focused lane must be company_winding_up");
assert(lane.candidate_templates >= 1, "Lane selection must report candidate templates");
assert(lane.private_text_committed === false, "Lane selection must not commit private text");
assert(activation.selected_lane === lane.selected_lane, "Activation lane mismatch");
assert(activation.committed_private_text === false, "Activation report must not commit private text");
assert(activation.approved_templates_active_in_routing === 1, "Exactly one template should be approved for first pilot");
assert(activation.rejected_templates_active_in_routing === 0, "Rejected templates must not be active");
assert(Array.isArray(activation.reviewed_templates) && activation.reviewed_templates.length === lane.candidate_templates, "Every lane candidate needs a redacted review decision");

const decisions = activation.reviewed_templates.reduce((acc, item) => {
  acc[item.review_decision] = (acc[item.review_decision] || 0) + 1;
  assert(/^real_lane_template_[a-f0-9]{12}$/.test(item.redacted_template_id), `${item.redacted_template_id}: expected redacted template ID`);
  assert(item.source_pack.startsWith("private_ingest_output/"), `${item.redacted_template_id}: source pack should point to private output path only`);
  assert(item.private_text_committed === false, `${item.redacted_template_id}: private text committed flag must be false`);
  assert(Array.isArray(item.prerequisites) && item.prerequisites.includes("statutoryDemandOrServiceEvidenceAvailable"), `${item.redacted_template_id}: missing winding-up prerequisites`);
  assert(["approved", "rejected", "needs_manual_review"].includes(item.review_decision), `${item.redacted_template_id}: invalid review decision`);
  return acc;
}, {});
assert(decisions.approved === 1, "One template should be approved");
assert((decisions.needs_manual_review || 0) >= 1, "At least one candidate should remain manual review");

assert(store.templates.length === 1, "Redacted store should contain only the approved template");
const template = store.templates[0];
assert(template.reviewStatus === "approved", "Approved lane template must be reviewStatus=approved");
assert(template.classificationStatus === "review_approved", "Approved lane template must be review_approved");
assert(template.activeInRouting === true, "Approved lane template must be active in routing");
assert(template.documentIntent === "COMPANY_WINDING_UP_PETITION", "Approved lane template must be winding-up petition");
assert(template.provenanceLabel === "TEMPLATE_BASED", "Forms must remain TEMPLATE_BASED");

console.log("private lane review activation ok");
