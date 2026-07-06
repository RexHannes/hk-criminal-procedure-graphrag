const {
  applyFormTemplate,
  ingestPrivateFormPack,
  loadFormStore,
  recommendClauses,
  routeForms,
  searchForms,
} = require("../../src/forms/form_system");

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload, null, 2));
}

function body(req) {
  return req.body && typeof req.body === "object" ? req.body : {};
}

function storeFromReq(req) {
  const requested = req.query?.store || body(req).storePath;
  return loadFormStore(requested || process.env.PRIVATE_FORM_STORE_PATH);
}

module.exports = {
  applyFormTemplate,
  body,
  ingestPrivateFormPack,
  json,
  recommendClauses,
  routeForms,
  searchForms,
  storeFromReq,
};
