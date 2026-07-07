#!/usr/bin/env node
const formPackIngest = require("../api/form-pack-ingest");
const { assert } = require("./forms_cli_common");
const { storeFromReq } = require("../api/forms/_utils");

function mockReq({ method = "GET", query = {}, body = {} } = {}) {
  return { method, query, body };
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

function expectStorePathRejected(req) {
  let threw = false;
  try {
    storeFromReq(req);
  } catch (error) {
    threw = true;
    assert(error.code === "user_store_path_forbidden", "store path override must be rejected with user_store_path_forbidden");
  }
  assert(threw, "request-controlled store path must not be accepted");
}

expectStorePathRejected(mockReq({ query: { store: "../../private_uploads" } }));
expectStorePathRejected(mockReq({ query: { storePath: "../../private_uploads" } }));
expectStorePathRejected(mockReq({ body: { storePath: "/etc/passwd" } }));

const originalNodeEnv = process.env.NODE_ENV;
const originalVercel = process.env.VERCEL;
const originalEnabled = process.env.FORMS_PRIVATE_API_ENABLED;
process.env.NODE_ENV = "production";
process.env.VERCEL = "1";
delete process.env.FORMS_PRIVATE_API_ENABLED;

const res = mockRes();
formPackIngest(mockReq({
  method: "POST",
  body: {
    allowLocalPrivatePath: true,
    input: "/tmp/private_forms",
    notebooklmNotes: "/tmp/private_notes.md",
    output: "/tmp/private_out",
    firm: "firm",
    workspace: "workspace",
    sourcePack: "Private pack",
    licenseNote: "Private test",
  },
}), res);

assert(res.statusCode === 403, "production form-pack ingest must return 403");
const payload = JSON.parse(res.payload);
assert(payload.error === "private_forms_api_disabled", "production form-pack ingest must be disabled by default");

process.env.NODE_ENV = originalNodeEnv;
process.env.VERCEL = originalVercel;
if (originalEnabled === undefined) delete process.env.FORMS_PRIVATE_API_ENABLED;
else process.env.FORMS_PRIVATE_API_ENABLED = originalEnabled;

console.log("forms API user path access blocked ok");
