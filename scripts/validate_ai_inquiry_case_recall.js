#!/usr/bin/env node
const { runLevel1Eval, runLevel2Eval } = require("../src/case_graph/case_authority_eval");

const l1 = runLevel1Eval();
const l2 = runLevel2Eval();
const errors = [];
if (!l1.pass) errors.push("level1_recall_failed");
if (!l2.pass) errors.push("level2_inquiry_failed");

if (errors.length) {
  console.error(JSON.stringify({
    ok: false,
    errors,
    level1: { pass: l1.pass, passed: l1.passed, total: l1.total },
    level2: { pass: l2.pass, passed: l2.passed, total: l2.total },
    failed_level1: l1.results.filter(r => !r.pass).map(r => r.id),
    failed_level2: l2.results.filter(r => !r.pass).map(r => r.id),
  }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({
  ok: true,
  level1: { pass: l1.pass, passed: l1.passed, total: l1.total },
  level2: { pass: l2.pass, passed: l2.passed, total: l2.total },
}, null, 2));
