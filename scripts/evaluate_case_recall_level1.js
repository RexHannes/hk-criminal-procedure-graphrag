#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { runLevel1Eval, writeEvalMarkdown } = require("../src/case_graph/case_authority_eval");

const ROOT = path.resolve(__dirname, "..");
const outJson = path.join(ROOT, "artifacts", "case_recall_level1_eval.json");
const outMd = path.join(ROOT, "artifacts", "case_recall_level1_eval.md");

const payload = runLevel1Eval();
fs.writeFileSync(outJson, `${JSON.stringify(payload, null, 2)}\n`);
fs.writeFileSync(outMd, `${writeEvalMarkdown("Case Recall Level 1 Evaluation", payload)}\n`);

console.log(JSON.stringify({ ok: payload.pass, passed: payload.passed, total: payload.total, path: outJson }, null, 2));
process.exit(payload.pass ? 0 : 1);
