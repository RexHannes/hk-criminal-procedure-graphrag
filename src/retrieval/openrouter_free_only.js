const {
  defaultFreeOpenRouterChatModel,
  isCuratedFreeOpenRouterModel,
} = require("./openrouter_free_models");

function isTruthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function isOpenRouterFreeOnlyEnabled(env = process.env) {
  if (String(env.OPENROUTER_FREE_ONLY || "").trim().toLowerCase() === "false") return false;
  return true;
}

function isOpenRouterPaidAllowed(env = process.env) {
  return isTruthy(env.OPENROUTER_ALLOW_PAID);
}

function isFreeOpenRouterModel(model) {
  return isCuratedFreeOpenRouterModel(model);
}

function isBlockedOpenRouterModel(model) {
  const normalized = String(model || "").trim().toLowerCase();
  if (!normalized) return true;
  if (normalized === "openrouter/auto") return true;
  return !isFreeOpenRouterModel(model);
}

function resolveOpenRouterModel(env = process.env, keys = []) {
  for (const key of keys) {
    const value = String(env[key] || "").trim();
    if (value) return value;
  }
  return "";
}

function assertFreeOpenRouterModel(model, env = process.env, { context = "openrouter_request" } = {}) {
  if (!isOpenRouterFreeOnlyEnabled(env) || isOpenRouterPaidAllowed(env)) {
    return { ok: true, model, enforced: false };
  }
  if (isFreeOpenRouterModel(model)) {
    return { ok: true, model, enforced: true };
  }
  const error = new Error(`openrouter_free_model_required:${context}:${model || "missing_model"}`);
  error.model = model;
  error.context = context;
  throw error;
}

function defaultFreeOpenRouterChatModelFromPolicy() {
  return defaultFreeOpenRouterChatModel();
}

module.exports = {
  assertFreeOpenRouterModel,
  defaultFreeOpenRouterChatModel: defaultFreeOpenRouterChatModelFromPolicy,
  isBlockedOpenRouterModel,
  isFreeOpenRouterModel,
  isOpenRouterFreeOnlyEnabled,
  isOpenRouterPaidAllowed,
  isTruthy,
  resolveOpenRouterModel,
};
