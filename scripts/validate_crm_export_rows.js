#!/usr/bin/env node
const fs = require("fs");
const { assert } = require("./forms_cli_common");

const csv = fs.readFileSync("artifacts/private_lane_crm_export_preview.csv", "utf8");
const lines = csv.trim().split(/\r?\n/);
assert(lines.length >= 4, "CRM CSV should have header plus at least 3 rows");
assert(lines[0].includes("rowId") && lines[0].includes("exportCategory"), "CRM CSV header missing required fields");
assert(csv.includes("COMPANY_WINDING_UP_PETITION"), "CRM export should include winding-up document intent");
assert(!/Dear Sirs|WITHOUT PREJUDICE|Atkins/i.test(csv), "CRM export appears to contain private text");
console.log("crm export rows ok");
