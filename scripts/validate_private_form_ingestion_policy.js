#!/usr/bin/env node
const fs = require("fs");
const { assert } = require("./forms_cli_common");

const gitignore = fs.readFileSync(".gitignore", "utf8");
[
  "private_uploads/",
  "private_ingest_output/",
  "private_templates/",
  "private_exports/",
  "private_notebooklm_notes/",
  "*.local.zip",
  "*.private.docx",
  "*.private.pdf",
].forEach(pattern => assert(gitignore.includes(pattern), `.gitignore missing ${pattern}`));

console.log("private form ingestion policy ok");
