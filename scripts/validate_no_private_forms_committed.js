#!/usr/bin/env node
const { execFileSync } = require("child_process");
const { assert } = require("./forms_cli_common");

const files = execFileSync("git", ["ls-files"], { encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
const bad = files.filter(file => (
  /^private_(uploads|ingest_output|templates|exports|notebooklm_notes)\//.test(file) ||
  /\.(private\.docx|private\.pdf|local\.zip)$/i.test(file) ||
  (/^fixtures\/forms\//.test(file) && /\.(docx|doc|pdf|zip)$/i.test(file))
));
assert(!bad.length, `Private/licensed form-like files committed: ${bad.join(", ")}`);
console.log("no private forms committed ok");
