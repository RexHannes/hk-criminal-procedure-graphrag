const fs = require("fs");
const path = require("path");
const { applyFormTemplate, loadFormStore } = require("./form_system");

function ensurePrivateExportPath(outputDir) {
  const resolved = path.resolve(outputDir || "private_exports");
  const root = path.resolve(process.cwd(), "private_exports");
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Private drafts may only be written under private_exports/");
  }
  fs.mkdirSync(resolved, { recursive: true });
  return resolved;
}

function selectApprovedTemplate(store, templateId = "") {
  const templates = store.templates || [];
  const template = templateId
    ? templates.find(item => item.id === templateId)
    : templates.find(item => item.reviewStatus === "approved" && item.classificationStatus === "review_approved");
  if (!template) throw new Error("Approved private template not found");
  if (template.reviewStatus !== "approved" || template.classificationStatus !== "review_approved") {
    throw new Error("Template is not approved for private draft rendering");
  }
  return template;
}

function renderPrivateDraftLocalOnly({
  storePath,
  templateId = "",
  matter = {},
  outputDir = "private_exports",
}) {
  const resolvedOutputDir = ensurePrivateExportPath(outputDir);
  const store = loadFormStore(storePath);
  const template = selectApprovedTemplate(store, templateId);
  const draft = applyFormTemplate({ store, templateId: template.id, matter });
  const output = {
    renderVersion: "private-draft-renderer-v1",
    generatedAt: "2026-07-07T00:00:00+08:00",
    templateId: template.id,
    documentIntent: template.documentIntent,
    lane: template.subPracticeArea || template.practiceArea || "",
    privateTextCommitted: false,
    outputScope: "private_exports_only",
    finalisationStatus: draft.finalApprovalBlocked ? "blocked" : "ready_for_lawyer_review",
    lawyerOnlyFieldCount: draft.lawyerOnlyFieldBlocks.length,
    fieldCount: draft.fieldCompletionReport.length,
    filledCount: draft.fieldCompletionReport.filter(item => item.status === "completed_from_matter_fact").length,
    missingCount: draft.fieldCompletionReport.filter(item => item.status === "missing").length + draft.blockedClausesReport.length,
    placeholderCount: draft.placeholderAudit.length + draft.blockedClausesReport.length,
    blockedClausesCount: draft.blockedClausesReport.length,
    fieldProvenance: draft.fieldProvenance.map(item => ({
      fieldKey: item.fieldKey,
      status: item.status,
      source: item.source,
      privateTextCommitted: false,
    })),
  };
  const fileName = `${template.id}.draft.metadata.json`;
  const outputPath = path.join(resolvedOutputDir, fileName);
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + "\n");
  return {
    ...output,
    outputPath,
  };
}

module.exports = {
  renderPrivateDraftLocalOnly,
};
