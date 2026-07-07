#!/usr/bin/env node
const { loadSyntheticStore, validateCoreStore } = require("./forms_cli_common");

validateCoreStore(loadSyntheticStore());
console.log("form template schema ok");
