#!/usr/bin/env node
/**
 * Validator: the editable SOP / HITL wiki prototype must actually work:
 *  - viewer/sop_editor.js exists and exposes propose/compare/status/export;
 *  - index.html loads it;
 *  - viewer/app.js wires functional (non-disabled) Propose edit / Compare buttons;
 *  - demo review queue artifact is valid (statuses, changelog, linked authorities).
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const errors = [];

const editorPath = path.join(ROOT, "viewer", "sop_editor.js");
if (!fs.existsSync(editorPath)) {
  errors.push("missing:viewer/sop_editor.js");
} else {
  const src = fs.readFileSync(editorPath, "utf8");
  for (const fn of ["openProposeModal", "openCompareModal", "saveProposal", "setStatus", "exportQueue", "renderDiffHtml"]) {
    if (!src.includes(fn)) errors.push(`sop_editor_missing_function:${fn}`);
  }
  if (!src.includes("localStorage")) errors.push("sop_editor_missing_local_persistence");
}

const htmlPath = path.join(ROOT, "viewer", "index.html");
const html = fs.readFileSync(htmlPath, "utf8");
if (!/sop_editor\.js/.test(html)) errors.push("index_html_missing_sop_editor_script");

const appPath = path.join(ROOT, "viewer", "app.js");
const app = fs.readFileSync(appPath, "utf8");
if (/<button[^>]*disabled[^>]*>Propose edit/.test(app)) errors.push("propose_edit_button_still_disabled");
if (/<button[^>]*disabled[^>]*>Compare versions/.test(app)) errors.push("compare_versions_button_still_disabled");
for (const marker of ["data-sop-propose", "data-sop-compare", "data-sop-approve", "data-sop-reject", "data-sop-export", "openProposeModal", "openCompareModal"]) {
  if (!app.includes(marker)) errors.push(`app_js_missing_sop_wiring:${marker}`);
}

const reviewsPath = path.join(ROOT, "data", "firm_overlay", "demo_firm_sop_reviews.json");
if (!fs.existsSync(reviewsPath)) {
  errors.push("missing:data/firm_overlay/demo_firm_sop_reviews.json");
} else {
  const reviews = JSON.parse(fs.readFileSync(reviewsPath, "utf8"));
  const proposals = reviews.proposals || [];
  if (!proposals.length) errors.push("no_seed_proposals");
  const allowedStatus = new Set(["proposed", "approved", "rejected"]);
  for (const proposal of proposals) {
    for (const field of ["proposal_id", "sop_id", "block_id", "old_text", "new_text", "status", "proposed_by", "created_at"]) {
      if (!proposal[field]) errors.push(`proposal_missing_field:${proposal.proposal_id || "?"}:${field}`);
    }
    if (!allowedStatus.has(proposal.status)) errors.push(`proposal_bad_status:${proposal.proposal_id}`);
    if (!Array.isArray(proposal.changelog) || !proposal.changelog.length) errors.push(`proposal_missing_changelog:${proposal.proposal_id}`);
    if (!Array.isArray(proposal.linked_authorities)) errors.push(`proposal_missing_linked_authorities:${proposal.proposal_id}`);
    if (proposal.status !== "proposed" && !proposal.reviewer) errors.push(`reviewed_proposal_missing_reviewer:${proposal.proposal_id}`);
  }
  // SOP/block ids must exist in the firm overlay.
  const firm = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "firm_overlay", "demo_firm.json"), "utf8"));
  const blocks = new Set((firm.sops || []).flatMap(sop => (sop.blocks || []).map(block => `${sop.sop_id}::${block.block_id}`)));
  for (const proposal of proposals) {
    if (!blocks.has(`${proposal.sop_id}::${proposal.block_id}`)) errors.push(`proposal_unknown_block:${proposal.proposal_id}`);
  }
}

if (errors.length) {
  console.error("validate_sop_editing_demo: FAIL");
  for (const err of errors) console.error(`  - ${err}`);
  process.exit(1);
}
console.log("validate_sop_editing_demo: PASS (propose/compare/approve/reject/export wired; seed queue valid)");
