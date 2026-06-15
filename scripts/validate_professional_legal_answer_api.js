#!/usr/bin/env node
/* Validate generic professional-mode legal answer contract via the inquiry API. */

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
        if (this.statusCode >= 400) reject(new Error(`HTTP ${this.statusCode}`));
        else resolve(payload);
      },
    };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

function blob(value) {
  return JSON.stringify(value || {}).toLowerCase();
}

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

(async () => {
  const errors = [];
  const payload = await run("What is the consequence for adducing inconsistent factual pleadings for the same Plaintiff across more than one case? Please elaborate on abuse of process, estoppel and collateral attack.");
  const headings = (payload.applied_answer?.sections || []).map(section => section.heading);
  const text = blob(payload.applied_answer);

  assert(payload.classification?.matter_type === "general_legal_research", "wrong matter type", errors);
  assert(payload.classification?.scenario === "inconsistent_positions_across_proceedings", "wrong scenario", errors);
  assert(payload.classification?.answer_mode === "professional_source_gated", "missing professional answer mode", errors);
  assert(payload.answer_contract?.domain === "general_legal_research", "missing general answer contract", errors);
  [
    "Legal Issues",
    "Source-Backed Rules",
    "Application To Facts",
    "Procedural Consequences",
    "Documents / Forms",
    "Missing Facts",
    "Risks / Caveats",
  ].forEach(heading => assert(headings.includes(heading), `missing section ${heading}`, errors));
  assert(text.includes("abuse of process"), "missing abuse of process discussion", errors);
  assert(text.includes("estoppel"), "missing estoppel discussion", errors);
  assert(text.includes("collateral attack"), "missing collateral attack discussion", errors);
  assert(text.includes("pleading inconsistency matrix"), "missing document/form workflow", errors);
  assert(text.includes("paragraph pinpoints"), "missing source/pinpoint caveat", errors);
  assert(!text.includes("fundraiser") && !text.includes("theft"), "irrelevant contamination leaked into professional answer", errors);
  assert(payload.source_audit?.display === "collapsed", "source audit should be collapsed", errors);
  assert(payload.source_audit?.verification_status === "candidate_authorities_require_paragraph_check", "candidate authority warning missing", errors);

  if (errors.length) {
    console.error("Professional legal answer validation failed:");
    errors.forEach(error => console.error(`- ${error}`));
    process.exit(1);
  }

  console.log("Professional legal answer validation passed.");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
