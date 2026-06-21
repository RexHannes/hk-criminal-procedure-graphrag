#!/usr/bin/env node
/* eslint-disable no-console */

const handler = require("../api/case-fruit-sop");

function run(req) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        resolve({ statusCode: this.statusCode, payload });
      },
    };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

(async () => {
  const errors = [];
  const getResult = await run({
    method: "GET",
    query: { node_id: "criminal_procedure_hk.bail_factors" },
    headers: {},
  });
  assert(getResult.statusCode === 200, `GET should return 200, got ${getResult.statusCode}`, errors);
  assert(getResult.payload.status === "ok", "GET payload should be ok", errors);
  assert(getResult.payload.cache_write === "not_requested", "GET should not write cache", errors);
  assert(getResult.payload.evidence_count > 0, "GET should recall case fruit evidence", errors);
  assert(getResult.payload.policy?.no_llm_tokens_used === true, "GET should use no LLM tokens", errors);
  assert(getResult.payload.cache_records?.sop_playbook?.status === "draft", "GET SOP should remain draft", errors);
  assert(getResult.payload.cache_records?.answer_snapshot?.answer_status === "research_only", "GET answer should remain research_only", errors);

  const originalToken = process.env.LEGAL_REVIEW_ADMIN_TOKEN;
  process.env.LEGAL_REVIEW_ADMIN_TOKEN = "test_admin_token";
  const unauthorizedWrite = await run({
    method: "POST",
    query: { node_id: "criminal_procedure_hk.bail_factors", write_cache: "1" },
    body: { write_cache: true },
    headers: {},
  });
  assert(unauthorizedWrite.statusCode === 401, `unauthorized POST should return 401, got ${unauthorizedWrite.statusCode}`, errors);
  assert(unauthorizedWrite.payload.error === "unauthorized_review_admin", "unauthorized POST should be admin-gated", errors);
  if (originalToken === undefined) delete process.env.LEGAL_REVIEW_ADMIN_TOKEN;
  else process.env.LEGAL_REVIEW_ADMIN_TOKEN = originalToken;

  const methodResult = await run({
    method: "PUT",
    query: { node_id: "criminal_procedure_hk.bail_factors" },
    headers: {},
  });
  assert(methodResult.statusCode === 405, `PUT should return 405, got ${methodResult.statusCode}`, errors);

  if (errors.length) {
    console.error("Case fruit SOP API validation failed:");
    errors.forEach(error => console.error(`- ${error}`));
    process.exit(1);
  }

  console.log("Case fruit SOP API validation passed.");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
