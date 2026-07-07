#!/usr/bin/env node
const fs = require("fs");
const { execFileSync } = require("child_process");
const { assert } = require("./forms_cli_common");

const files = execFileSync("git", ["ls-files", "artifacts", "fixtures/forms", "data/forms"], { encoding: "utf8" })
  .split(/\r?\n/)
  .filter(Boolean)
  .filter(file => /\.(json|md|csv)$/.test(file));
const forbidden = [
  /Dear Sirs/i,
  /WITHOUT PREJUDICE/i,
  /\bAtkins\b/i,
  /Consultancy agreement/i,
  /formw\d/i,
  /\/Users\/puiyuenwong/i,
];
for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  for (const pattern of forbidden) {
    assert(!pattern.test(text), `${file} appears to contain private text marker ${pattern}`);
  }
}
console.log("no private text in reports ok");
