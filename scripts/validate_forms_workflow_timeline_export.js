#!/usr/bin/env node
const fs = require("fs");
const { assert } = require("./forms_cli_common");

const report = JSON.parse(fs.readFileSync("artifacts/forms_workflow_timeline_demo_report.json", "utf8"));
const md = fs.readFileSync("artifacts/forms_workflow_timeline_demo_report.md", "utf8");
const apiSource = fs.readFileSync("api/search-evidence.js", "utf8");

assert(report.status === "synthetic_redacted_timeline_ready", "Timeline demo report must be ready");
assert(report.private_text_committed === false, "Timeline demo must not commit private text");
assert(report.external_services_used === false, "Timeline demo must not use external services");
assert(report.professional_advice_certified === false, "Timeline demo must not claim professional advice certification");
assert(report.boundaries?.public_authority_analysis_separate === true, "Public authority analysis must remain separate");
assert(report.boundaries?.private_template_layer_separate === true, "Private template layer must remain separate");
assert(report.recommended_form_count >= 1, "Timeline demo should include at least one recommended form");
assert(Array.isArray(report.workflow_timeline?.steps), "Timeline report must include workflow steps");
assert(report.workflow_timeline.steps.some(step => step.part === "Part 1"), "Timeline must include Part 1 legal analysis");
assert(report.workflow_timeline.steps.some(step => step.part === "Part 2"), "Timeline must include Part 2 documentary flow");
assert(report.workflow_timeline.steps.some(step => step.part === "Part 3"), "Timeline must include Part 3 CRM/workflow export");
assert(report.workflow_timeline.professionalAdviceCertified === false, "Workflow timeline must not certify professional advice");
assert(report.crm_workflow_export.length === report.workflow_timeline.steps.length, "CRM export rows must align with timeline steps");
assert(report.crm_workflow_export.every(row => row.professionalAdviceCertified === false), "CRM export rows must not certify professional advice");
assert(report.recommended_forms.every(item => item.provenanceLabel === "TEMPLATE_BASED"), "Recommended forms must stay TEMPLATE_BASED");
assert(apiSource.includes("workflow_timeline"), "Search evidence API must expose workflow_timeline separately");
assert(apiSource.includes("crm_workflow_export"), "Search evidence API must expose crm_workflow_export separately");
assert(/Part 1/.test(md) && /Part 2/.test(md) && /Part 3/.test(md), "Markdown must explain Part 1/2/3 flow");
assert(!/Dear Sirs|WITHOUT PREJUDICE/i.test(md), "Timeline markdown appears to contain private form text");

console.log("forms workflow timeline export ok");
