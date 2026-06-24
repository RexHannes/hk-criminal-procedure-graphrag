#!/usr/bin/env node
/* Validate that OpenRouter cannot silently use paid/auto models. */

process.env.OPENROUTER_API_KEY = "test-key-not-real";
process.env.OPENROUTER_MODEL = "openrouter/auto";
process.env.OPENROUTER_FREE_ONLY = "true";
delete process.env.OPENROUTER_ALLOW_PAID;
delete process.env.DEEPSEEK_API_KEY;

const handler = require("../api/search-evidence.js");

function run(query) {
  return new Promise((resolve, reject) => {
    const req = { method: "GET", query: { q: query } };
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        if (this.statusCode >= 400) reject(new Error(`HTTP ${this.statusCode}: ${JSON.stringify(payload)}`));
        else resolve(payload);
      },
    };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

(async () => {
  const payload = await run("What is bail in Hong Kong?");
  const warnings = payload.warnings || [];
  if (!warnings.includes("openrouter_free_model_required")) {
    console.error("Expected OpenRouter auto/paid guard warning.");
    console.error(JSON.stringify({ warnings, inquiry_analysis: payload.inquiry_analysis }, null, 2));
    process.exit(1);
  }
  if (payload.inquiry_analysis) {
    console.error("Inquiry analysis should not be produced through a blocked OpenRouter model.");
    console.error(JSON.stringify({ warnings, inquiry_analysis: payload.inquiry_analysis }, null, 2));
    process.exit(1);
  }
  console.log("OpenRouter free-only policy validation passed.");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
