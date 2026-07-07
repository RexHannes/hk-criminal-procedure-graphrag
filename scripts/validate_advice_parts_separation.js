#!/usr/bin/env node
const fs = require("fs");
const { assert } = require("./forms_cli_common");
const matterAdvice = fs.readFileSync("api/advice/matter-advice.js", "utf8");
const searchEvidence = fs.readFileSync("api/search-evidence.js", "utf8");

assert(fs.existsSync("api/advice/matter-advice.js"), "Matter advice API missing");
assert(matterAdvice.includes("part1LegalAnalysis"), "Matter advice must return Part 1");
assert(matterAdvice.includes("part2DocumentaryFlow"), "Matter advice must return Part 2");
assert(matterAdvice.includes("part3WorkflowTimeline"), "Matter advice must return Part 3");
assert(matterAdvice.includes("publicAuthoritySeparate: true"), "Part 1/public authority boundary missing");
assert(matterAdvice.includes("privateFormsSeparate: true"), "Private forms boundary missing");
assert(matterAdvice.includes("notebooklmInternalOnly: true"), "NotebookLM internal-only boundary missing");
assert(searchEvidence.includes("private_form_recommendations"), "Search evidence must keep private forms in separate field");
console.log("advice parts separation ok");
