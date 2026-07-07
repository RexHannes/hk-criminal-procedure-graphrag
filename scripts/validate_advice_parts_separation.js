#!/usr/bin/env node
const fs = require("fs");
const { assert } = require("./forms_cli_common");
const formsRecommend = fs.readFileSync("api/forms/recommend.js", "utf8");
const searchEvidence = fs.readFileSync("api/search-evidence.js", "utf8");
const vercel = JSON.parse(fs.readFileSync("vercel.json", "utf8"));

assert((vercel.rewrites || []).some(rule => rule.source === "/api/advice/matter-advice" && /matter-advice/.test(rule.destination)), "Matter advice API rewrite missing");
assert(formsRecommend.includes("part1LegalAnalysis"), "Matter advice must return Part 1");
assert(formsRecommend.includes("part2DocumentaryFlow"), "Matter advice must return Part 2");
assert(formsRecommend.includes("part3WorkflowTimeline"), "Matter advice must return Part 3");
assert(formsRecommend.includes("publicAuthoritySeparate: true"), "Part 1/public authority boundary missing");
assert(formsRecommend.includes("privateFormsSeparate: true"), "Private forms boundary missing");
assert(formsRecommend.includes("notebooklmInternalOnly: true"), "NotebookLM internal-only boundary missing");
assert(searchEvidence.includes("private_form_recommendations"), "Search evidence must keep private forms in separate field");
console.log("advice parts separation ok");
