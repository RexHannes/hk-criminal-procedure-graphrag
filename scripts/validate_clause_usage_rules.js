#!/usr/bin/env node
const { assert, loadSyntheticStore } = require("./forms_cli_common");

const store = loadSyntheticStore();
assert(store.usageRules.length >= store.clauses.length, "Expected at least one usage rule per clause");
assert(store.usageRules.some(r => r.ruleType === "BLOCK_IF_EVIDENCE_MISSING"), "Expected missing-evidence blocker rule");
assert(store.usageRules.every(r => r.conditionExpression && r.naturalLanguageCondition), "Every usage rule needs machine and natural-language condition");
console.log("clause usage rules ok");
