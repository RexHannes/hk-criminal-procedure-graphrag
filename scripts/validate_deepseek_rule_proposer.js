#!/usr/bin/env node
/* eslint-disable no-console */

const { buildPrompt, deepseekChat } = require("../src/case_graph/deepseek_rule_proposer");

const errors = [];
function assert(condition, message) {
  if (!condition) errors.push(message);
}

const prompt = buildPrompt({
  source: { source_id: "source_demo" },
  paragraphNo: "1",
  paragraphText: "1. Bail decisions involve a risk assessment looking to the future.",
  allowedDoctrineNodeIds: ["criminal_procedure_hk.bail_factors"],
});

assert(prompt.length === 2, "prompt should have system and user messages");
assert(prompt[0].content.includes("Do not invent quotes"), "prompt must forbid invented quotes");
assert(prompt[0].content.includes("Do not mark anything approved or answer_safe"), "prompt must forbid answer_safe");
assert(prompt[1].content.includes("criminal_procedure_hk.bail_factors"), "prompt must include allowed node IDs");

(async () => {
  try {
    await deepseekChat({ env: {}, messages: prompt });
    errors.push("deepseek without key should fail closed");
  } catch (error) {
    assert(error.message.includes("DEEPSEEK_API_KEY required"), "missing key error expected");
  }
  if (errors.length) {
    console.error("DeepSeek rule proposer validation failed:");
    errors.forEach(error => console.error(`- ${error}`));
    process.exit(1);
  }
  console.log("DeepSeek rule proposer validation passed.");
})();
