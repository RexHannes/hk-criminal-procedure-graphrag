#!/usr/bin/env node
const { resolveAllVisibleCaseSources, authoritySummaryStats } = require("../src/case_graph/verified_case_authority");

const result = resolveAllVisibleCaseSources({ write: true });
const stats = authoritySummaryStats();
console.log(JSON.stringify({ ok: true, ...stats, excluded: result.excluded.total_excluded }, null, 2));
