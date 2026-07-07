#!/usr/bin/env node
const fs = require("fs");
const { assert } = require("./forms_cli_common");

const report = JSON.parse(fs.readFileSync("artifacts/part2_documentary_flow_report.json", "utf8"));
assert(fs.existsSync("src/advice/documentary_flow_composer.js"), "Documentary flow composer missing");
assert(fs.existsSync("src/advice/part2_document_advice.js"), "Part 2 document advice module missing");
assert(report.private_text_committed === false, "Part 2 report must be metadata only");
assert(report.recommended_count >= 1, "Part 2 must include recommended documents");
assert(report.placeholder_only_count >= 1, "Part 2 must include placeholder-only document for missing evidence");
assert(report.required_evidence_count >= 1, "Part 2 must surface required evidence");
assert(report.part2.provenance.includes("TEMPLATE_BASED"), "Part 2 provenance must include TEMPLATE_BASED");
assert(report.part2.reviewGates.includes("lawyer_review_required_before_final_document_output"), "Part 2 must include lawyer review gate");
console.log("part2 documentary flow ok");
