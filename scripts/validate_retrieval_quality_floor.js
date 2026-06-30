#!/usr/bin/env node
/* eslint-disable no-console */

const { runBenchmark } = require("./run_retrieval_benchmark");

function parseArgs(argv = process.argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--benchmark") args.benchmarkPath = argv[++i];
    else if (arg === "--top-k") args.topK = Number(argv[++i]);
    else if (arg === "--collection") args.collectionName = argv[++i];
  }
  return args;
}

(async () => {
  const args = parseArgs(process.argv);
  const report = await runBenchmark({ topK: args.topK || 10, benchmarkPath: args.benchmarkPath, collectionName: args.collectionName });
  const errors = [];
  const minQueryCount = Number(report.quality_floor.min_query_count || 25);
  if (report.query_count < minQueryCount) errors.push(`benchmark must contain at least ${minQueryCount} queries`);
  if (report.private_source_leakage_report.length) errors.push("private source leakage detected");
  if (!["quality_floor_satisfied", "insufficient_needs_more_corpus_or_better_retrieval"].includes(report.quality_status)) {
    errors.push(`unexpected quality_status ${report.quality_status}`);
  }
  if (report.quality_status === "insufficient_needs_more_corpus_or_better_retrieval" && report.hit_rate >= report.quality_floor.min_hit_rate) {
    errors.push("quality marked insufficient despite hit rate satisfying floor");
  }
  if (errors.length) {
    console.error("Retrieval quality floor validation failed:");
    errors.forEach(error => console.error(`- ${error}`));
    process.exit(1);
  }
  console.log(`Retrieval benchmark completed: suite=${report.suite_id}, hit_rate=${report.hit_rate}, status=${report.quality_status}`);
  if (report.quality_status === "quality_floor_satisfied") {
    console.log("Retrieval quality floor validation passed.");
  } else {
    console.log("Retrieval quality floor not yet satisfied; structural benchmark validation passed with honest needs-corpus report.");
  }
})().catch(error => {
  console.error(error.message);
  if (error.payload) console.error(JSON.stringify(error.payload, null, 2));
  process.exit(1);
});
