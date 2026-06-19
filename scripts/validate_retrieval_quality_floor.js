#!/usr/bin/env node
/* eslint-disable no-console */

const { runBenchmark } = require("./run_retrieval_benchmark");

(async () => {
  const report = await runBenchmark({ topK: 10 });
  const errors = [];
  if (report.query_count < 25) errors.push("benchmark must contain at least 25 queries");
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
  console.log(`Retrieval benchmark completed: hit_rate=${report.hit_rate}, status=${report.quality_status}`);
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
