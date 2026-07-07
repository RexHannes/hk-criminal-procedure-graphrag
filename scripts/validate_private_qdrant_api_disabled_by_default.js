#!/usr/bin/env node
const recommend = require("../api/forms/recommend");
const { assert } = require("./forms_cli_common");

function mockReq({ method = "GET", query = {}, body = {} } = {}) {
  return {
    method,
    query,
    body,
    [Symbol.asyncIterator]: async function* iterator() {},
  };
}

function mockRes() {
  return {
    statusCode: 0,
    headers: {},
    payload: "",
    setHeader(name, value) { this.headers[name] = value; },
    end(value) { this.payload = value; },
  };
}

(async () => {
  const original = process.env.PRIVATE_QDRANT_FORMS_ENABLED;
  delete process.env.PRIVATE_QDRANT_FORMS_ENABLED;
  const res = mockRes();
  await recommend(mockReq({
    method: "POST",
    body: {
      formsMode: "private-qdrant-recall",
      firmId: "private-lane-pilot-firm",
      workspaceId: "company-winding-up-pilot",
      matter: {
        practiceArea: "company_corporate",
        practiceLane: "company_winding_up",
        matterType: "company_winding_up",
        workflowStage: "COMPANY_WINDING_UP",
        clientRole: "creditor",
      },
      documentIntent: "COMPANY_WINDING_UP_PETITION",
      workflowStage: "COMPANY_WINDING_UP",
    },
  }), res);
  if (original === undefined) delete process.env.PRIVATE_QDRANT_FORMS_ENABLED;
  else process.env.PRIVATE_QDRANT_FORMS_ENABLED = original;
  assert(res.statusCode === 403, "private-qdrant-recall must be disabled by default");
  const payload = JSON.parse(res.payload);
  assert(payload.error === "private_qdrant_forms_disabled", "private-qdrant-recall must fail closed");
  console.log("private qdrant API disabled by default ok");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
