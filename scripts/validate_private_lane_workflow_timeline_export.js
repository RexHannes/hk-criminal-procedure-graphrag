#!/usr/bin/env node
const fs = require("fs");
const { assert } = require("./forms_cli_common");

const report = JSON.parse(fs.readFileSync("artifacts/private_lane_workflow_timeline_report.json", "utf8"));
const csv = fs.readFileSync("artifacts/private_lane_crm_export_preview.csv", "utf8");

assert(report.selected_lane === "company_winding_up", "Workflow timeline must target company_winding_up");
assert(report.private_text_committed === false, "Workflow timeline must not commit private text");
assert(report.professional_advice_certified === false, "Workflow timeline must not certify professional advice");
assert(report.part_1?.legal_analysis_status === "research_required_separate_from_forms", "Part 1 must remain separate legal analysis");
assert(report.part_1?.source_status === "public_authority_placeholder_only", "Part 1 must not pretend private forms are authority");
assert(report.part_2?.recommended_form === "Company winding-up petition metadata template", "Part 2 must include recommended lane metadata form");
assert(report.part_2?.missing_facts.includes("statutoryDemandOrServiceEvidenceAvailable"), "Part 2 must include missing service-evidence blocker");
assert(report.part_2?.lawyer_review_gate === "approved_metadata_only_for_one_template", "Part 2 must state metadata-only review gate");
assert(report.part_3?.export_format === "crm_workflow_v0", "Part 3 must expose CRM workflow export format");
assert(report.part_3.crm_rows.length >= 3, "CRM export should include Part 1, Part 2, and Part 3 rows");
assert(report.part_3.crm_rows.some(row => row.part === "Part 1"), "CRM export missing Part 1 row");
assert(report.part_3.crm_rows.some(row => row.part === "Part 2" && row.documentIntent === "COMPANY_WINDING_UP_PETITION"), "CRM export missing Part 2 winding-up row");
assert(report.part_3.crm_rows.some(row => row.part === "Part 3"), "CRM export missing Part 3 row");
assert(report.part_3.crm_rows.every(row => row.professionalAdviceCertified === false), "CRM rows must not certify professional advice");
assert(csv.includes("COMPANY_WINDING_UP_PETITION"), "CRM CSV must include winding-up document intent");
assert(!/Dear Sirs|WITHOUT PREJUDICE|Atkins/i.test(csv), "CRM CSV appears to contain private form text");

console.log("private lane workflow timeline export ok");
