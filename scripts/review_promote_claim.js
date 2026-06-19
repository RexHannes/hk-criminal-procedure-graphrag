#!/usr/bin/env node
/* eslint-disable no-console */

const { promoteReviewItem } = require("../src/review/promotion_api");

function args(argv) {
  const parsed = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--item-id") parsed.itemId = argv[++i];
    else if (arg === "--to") parsed.toStatus = argv[++i];
    else if (arg === "--reviewer") parsed.reviewer = argv[++i];
    else if (arg === "--reason") parsed.reason = argv[++i];
    else if (arg === "--source-text") parsed.sourceText = argv[++i];
    else if (arg === "--store") parsed.storePath = argv[++i];
  }
  return parsed;
}

try {
  const promoted = promoteReviewItem(args(process.argv));
  console.log(JSON.stringify({ status: "promoted", item: promoted }, null, 2));
} catch (error) {
  console.error(error.message);
  if (error.errors) error.errors.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}
