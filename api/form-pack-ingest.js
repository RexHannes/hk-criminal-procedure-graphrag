const { body, ingestPrivateFormPack, isProductionRuntime, json, privateFormsApiEnabled } = require("./forms/_utils");

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    json(res, 200, {
      status: "contract_only",
      message: "Use the local script for real private ingestion. This endpoint does not accept public uploads.",
      script: "node scripts/ingest_private_form_pack.js --input private_uploads/... --firm ... --workspace ... --source-pack ... --license-note ... --output private_ingest_output/...",
    });
    return;
  }
  if (req.method !== "POST") {
    json(res, 405, { error: "method_not_allowed" });
    return;
  }
  if (!privateFormsApiEnabled() || isProductionRuntime()) {
    json(res, 403, {
      error: "private_forms_api_disabled",
      message: "Private form ingestion is local-script only unless FORMS_PRIVATE_API_ENABLED=true in a non-production environment.",
    });
    return;
  }
  const payload = body(req);
  if (!payload.allowLocalPrivatePath) {
    json(res, 403, {
      error: "private_ingestion_requires_local_explicit_path",
      message: "Do not upload private forms to the public demo. Run the local script or pass allowLocalPrivatePath in a private environment.",
    });
    return;
  }
  try {
    const result = ingestPrivateFormPack({
      input: payload.input,
      firm: payload.firm,
      workspace: payload.workspace,
      sourcePack: payload.sourcePack,
      licenseNote: payload.licenseNote,
      notebooklmNotes: payload.notebooklmNotes,
      output: payload.output,
      uploadedBy: payload.uploadedBy || "api-local-user",
      demoMode: payload.demoMode === true,
    });
    json(res, 200, {
      status: "ok",
      privateStorePath: result.privateStorePath,
      templates: result.templates.length,
      clauses: result.clauses.length,
      usageRules: result.usageRules.length,
    });
  } catch (error) {
    json(res, 400, { error: error.message });
  }
};
