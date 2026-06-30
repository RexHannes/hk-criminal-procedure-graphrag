const { exactJsonHeaders } = require("../api/json_content_type");
const { assertFreeOpenRouterModel } = require("./openrouter_free_only");

const DEFAULT_ALLOWED_OPENROUTER_KEY_SUFFIX = "11bb60";

function allowedOpenRouterKeySuffix(env = process.env) {
  return String(env.LEGAL_OPENROUTER_ALLOWED_KEY_SUFFIX || DEFAULT_ALLOWED_OPENROUTER_KEY_SUFFIX).trim();
}

function assertAllowedOpenRouterKey(env = process.env) {
  const key = String(env.OPENROUTER_API_KEY || "");
  if (!key) throw new Error("missing_openrouter_key:OPENROUTER_API_KEY");
  const suffix = allowedOpenRouterKeySuffix(env);
  if (suffix && !key.endsWith(suffix)) {
    throw new Error(`openrouter_key_not_allowed_suffix:expected_*${suffix}`);
  }
  return { ok: true, key_suffix: key.slice(-6) };
}

function openRouterHeaders(env) {
  assertAllowedOpenRouterKey(env);
  return exactJsonHeaders({
    Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
    "HTTP-Referer": env.OPENROUTER_HTTP_REFERER || "https://hk-criminal-procedure-graphrag.local",
    "X-Title": env.OPENROUTER_APP_NAME || "hk-criminal-procedure-graphrag",
  });
}

async function postOpenRouter(path, { env = process.env, body } = {}) {
  if (body && typeof body === "object" && body.model) {
    assertFreeOpenRouterModel(body.model, env, { context: path.replace(/^\//, "") || "openrouter_request" });
  }
  const response = await fetch(`https://openrouter.ai/api/v1${path}`, {
    method: "POST",
    headers: openRouterHeaders(env),
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(`openrouter_http_${response.status}`);
    error.payload = payload;
    throw error;
  }
  return payload;
}

module.exports = {
  DEFAULT_ALLOWED_OPENROUTER_KEY_SUFFIX,
  allowedOpenRouterKeySuffix,
  assertAllowedOpenRouterKey,
  openRouterHeaders,
  postOpenRouter,
};
