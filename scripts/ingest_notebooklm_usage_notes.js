#!/usr/bin/env node
const fs = require("fs");
const { parseArgs, parseNotebooklmNotes } = require("./forms_cli_common");

const args = parseArgs();
if (!args.input) throw new Error("--input is required");
const notes = parseNotebooklmNotes(fs.readFileSync(args.input, "utf8"), args.sourceNotebook || args.input);
console.log(JSON.stringify({ status: "ok", notes }, null, 2));
