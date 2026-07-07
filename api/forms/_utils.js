const {
  applyFormTemplate,
  ingestPrivateFormPack,
  loadFormStore,
  recommendClauses,
  routeForms,
  searchForms,
} = require("../../src/forms/form_system");

const DEFAULT_DEMO_FIRM_ID = "demo-firm";
const DEFAULT_DEMO_WORKSPACE_ID = "demo-pi";

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload, null, 2));
}

function body(req) {
  if (!req.body) return {};
  if (typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  try {
    return JSON.parse(Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body));
  } catch {
    return {};
  }
}

async function readBody(req) {
  const parsed = body(req);
  if (Object.keys(parsed).length) return parsed;
  if (req.body && !(typeof req.body === "object" && !Buffer.isBuffer(req.body))) return parsed;
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  if (!chunks.length) return {};
  try {
    const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    req.body = payload;
    return payload;
  } catch {
    return {};
  }
}

function isProductionRuntime() {
  return process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
}

function privateFormsApiEnabled() {
  return String(process.env.FORMS_PRIVATE_API_ENABLED || "false").toLowerCase() === "true";
}

function parseStoreConfig() {
  if (!process.env.FORMS_STORE_CONFIG_JSON) return {};
  try {
    return JSON.parse(process.env.FORMS_STORE_CONFIG_JSON);
  } catch (error) {
    throw new Error("FORMS_STORE_CONFIG_JSON is invalid JSON");
  }
}

function resolveConfiguredStorePath({ firmId, workspaceId } = {}) {
  const firm = firmId || DEFAULT_DEMO_FIRM_ID;
  const workspace = workspaceId || DEFAULT_DEMO_WORKSPACE_ID;
  const key = `${firm}:${workspace}`;
  const config = parseStoreConfig();
  if (config[key]) return config[key];
  if (firm === DEFAULT_DEMO_FIRM_ID && workspace === DEFAULT_DEMO_WORKSPACE_ID) {
    return process.env.FORMS_DEMO_STORE_PATH || "fixtures/forms/synthetic_store";
  }
  if (firm === "private-lane-pilot-firm" && workspace === "company-winding-up-pilot") {
    return process.env.FORMS_COMPANY_WINDING_UP_STORE_PATH || "fixtures/forms/private_lane_company_winding_up_store";
  }
  if (privateFormsApiEnabled() && !isProductionRuntime() && process.env.PRIVATE_FORM_STORE_PATH) {
    return process.env.PRIVATE_FORM_STORE_PATH;
  }
  throw new Error(`No server-side form store is configured for ${key}`);
}

function storeFromReq(req) {
  const payload = body(req);
  if (req.query?.store || req.query?.storePath || payload.store || payload.storePath) {
    const err = new Error("Request-controlled form store paths are disabled");
    err.statusCode = 400;
    err.code = "user_store_path_forbidden";
    throw err;
  }
  const firmId = payload.firmId || req.query?.firmId || DEFAULT_DEMO_FIRM_ID;
  const workspaceId = payload.workspaceId || req.query?.workspaceId || DEFAULT_DEMO_WORKSPACE_ID;
  return loadFormStore(resolveConfiguredStorePath({ firmId, workspaceId }));
}

module.exports = {
  applyFormTemplate,
  body,
  ingestPrivateFormPack,
  isProductionRuntime,
  json,
  privateFormsApiEnabled,
  readBody,
  recommendClauses,
  resolveConfiguredStorePath,
  routeForms,
  searchForms,
  storeFromReq,
};
