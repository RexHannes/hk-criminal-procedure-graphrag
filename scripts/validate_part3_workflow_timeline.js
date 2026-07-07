#!/usr/bin/env node
const fs = require("fs");
const { assert } = require("./forms_cli_common");

const report = JSON.parse(fs.readFileSync("artifacts/part3_workflow_timeline_report.json", "utf8"));
const formsRecommend = fs.readFileSync("api/forms/recommend.js", "utf8");
const vercel = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
assert(fs.existsSync("src/advice/workflow_timeline_composer.js"), "Workflow timeline composer missing");
assert((vercel.rewrites || []).some(rule => rule.source === "/api/advice/workflow-timeline" && /workflow-timeline/.test(rule.destination)), "Workflow timeline API rewrite missing");
assert(formsRecommend.includes("workflow-timeline"), "Workflow timeline mode missing from shared Forms API handler");
assert(report.private_text_committed === false, "Part 3 report must be metadata only");
assert(report.professional_advice_certified === false, "Part 3 must not certify professional advice");
assert(report.row_count >= 3, "Timeline should include Part 1, Part 2, and Part 3 rows");
assert(report.timeline.some(row => row.part === "Part 1"), "Missing Part 1 row");
assert(report.timeline.some(row => row.part === "Part 2"), "Missing Part 2 row");
assert(report.timeline.some(row => row.part === "Part 3"), "Missing Part 3 row");
console.log("part3 workflow timeline ok");
