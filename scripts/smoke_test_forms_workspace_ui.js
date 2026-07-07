#!/usr/bin/env node
const fs = require("fs");
const { assert } = require("./forms_cli_common");

const html = fs.readFileSync("viewer/index.html", "utf8");
const app = fs.readFileSync("viewer/app.js", "utf8");
assert(html.includes('data-view="forms"'), "Viewer sidebar must include Forms workspace");
assert(app.includes("viewForms"), "viewer/app.js must render Forms workspace");
assert(app.includes("Form Pack Inventory"), "Forms workspace must expose form inventory panel");
assert(app.includes("Dropzone Status"), "Forms workspace must expose dropzone status panel");
assert(app.includes("Review Activation"), "Forms workspace must expose review activation panel");
assert(app.includes("Matter-Specific Document Advice"), "Forms workspace must expose document advice panel");
assert(app.includes("Blocked Forms / Why Not"), "Forms workspace must expose blocked-form panel");
assert(app.includes("Draft Builder"), "Forms workspace must expose draft builder panel");
assert(app.includes("Timeline / CRM Preview"), "Forms workspace must expose timeline/CRM panel");
assert(app.includes("machine candidate"), "Forms workspace must show machine candidate status");
assert(app.includes("Reviewed metadata") || app.includes("approved metadata"), "Forms workspace must show reviewed metadata status");
assert(app.includes("Classification review decision"), "Forms inspector must expose classification review decision");
assert(app.includes("candidate links"), "NotebookLM usage links must be visibly candidate links");
assert(!app.includes("<iframe"), "Forms workspace must not use iframe as primary UI");
console.log("forms workspace UI smoke ok");
