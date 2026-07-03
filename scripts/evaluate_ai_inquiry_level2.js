#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { runLevel2Eval, writeEvalMarkdown } = require("../src/case_graph/case_authority_eval");

const ROOT = path.resolve(__dirname, "..");
const outJson = path.join(ROOT, "artifacts", "ai_inquiry_level2_eval.json");
const outMd = path.join(ROOT, "artifacts", "ai_inquiry_level2_eval.md");

const payload = runLevel2Eval();
fs.writeFileSync(outJson, `${JSON.stringify(payload, null, 2)}\n`);
fs.writeFileSync(outMd, `${writeEvalMarkdown("AI Inquiry Level 2 Evaluation", payload)}\n`);

console.log(JSON.stringify({ ok: payload.pass, passed: payload.passed, total: payload.total, path: outJson }, null, 2));
process.exit(payload.pass ? 0 : 1);
