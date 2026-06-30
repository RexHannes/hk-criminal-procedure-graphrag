#!/usr/bin/env node
/* eslint-disable no-console */

const path = require("path");
const fs = require("fs");
const {
  collectPilotSources,
  dedupeRecords,
  harvestLegalRefDis,
  importJsonl,
  writeCorpusArtifacts,
} = require("../src/case_graph/investor_recall_corpus");

const ROOT = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const args = {
    targetCases: 25000,
    disStart: 100000,
    disEnd: 360000,
    concurrency: 16,
    criminalOnly: true,
    mergePilots: true,
    importPath: "",
    harvest: true,
    output: "",
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--target-cases") args.targetCases = Number(argv[++i] || args.targetCases);
    else if (arg === "--dis-start") args.disStart = Number(argv[++i] || args.disStart);
    else if (arg === "--dis-end") args.disEnd = Number(argv[++i] || args.disEnd);
    else if (arg === "--concurrency") args.concurrency = Number(argv[++i] || args.concurrency);
    else if (arg === "--import") args.importPath = path.resolve(ROOT, argv[++i] || "");
    else if (arg === "--output") args.output = path.resolve(ROOT, argv[++i] || "");
    else if (arg === "--no-harvest") args.harvest = false;
    else if (arg === "--all-judgments") args.criminalOnly = false;
    else if (arg === "--no-merge-pilots") args.mergePilots = false;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const outputDir = args.output || path.join(ROOT, "data", "legal_ingest", "investor_recall", "corpus_v1");
  const existingPath = path.join(outputDir, "case_recall_cards.json");
  const records = [];
  if (fs.existsSync(existingPath) && args.harvest) {
    const existing = JSON.parse(fs.readFileSync(existingPath, "utf8"));
    records.push(...(existing.case_recall_cards || []));
    console.error(`Resuming from ${records.length} existing recall cards in ${existingPath}`);
  }
  if (args.mergePilots) records.push(...collectPilotSources());
  if (args.importPath) records.push(...importJsonl(args.importPath));

  let harvestMeta = { skipped: true };
  if (args.harvest) {
    console.error(`Harvesting LegalRef DIS ${args.disStart}-${args.disEnd} (concurrency=${args.concurrency}, criminalOnly=${args.criminalOnly})...`);
    const span = args.disEnd - args.disStart + 1;
    console.error(`  ~${span} DIS slots; at ~10% criminal yield expect up to ~${Math.round(span * 0.1)} cases; overnight run ~${Math.round(span / (args.concurrency * 4))} min at 4 DIS/s`);
    const harvest = await harvestLegalRefDis({
      startDis: args.disStart,
      endDis: args.disEnd,
      concurrency: args.concurrency,
      criminalOnly: args.criminalOnly,
      maxCases: args.targetCases,
      onProgress: stats => {
        if (stats.scanned % 2000 === 0) {
          console.error(`  scanned=${stats.scanned} accepted=${stats.accepted} last_dis=${stats.dis}`);
        }
      },
    });
    records.push(...harvest.records);
    harvestMeta = {
      dis_range: [args.disStart, args.disEnd],
      scanned: harvest.scanned,
      accepted_from_harvest: harvest.accepted,
      sample_errors: harvest.errors.slice(0, 5),
    };
  }

  const deduped = dedupeRecords(records);
  const result = writeCorpusArtifacts({
    records: deduped,
    outputDir,
    targetCases: args.targetCases,
    harvestMeta,
  });

  const report = {
    script: "build_investor_recall_corpus",
    target_cases: args.targetCases,
    case_count: result.records.length,
    pending_to_target: Math.max(0, args.targetCases - result.records.length),
    output_dir: result.outputDir,
    status: result.records.length >= args.targetCases ? "target_met" : "partial_recall_corpus",
    investor_pitch: result.records.length >= 10000
      ? "Case-level recall corpus is large enough for investor search demos; proposition answer-safe accuracy remains branch-by-branch."
      : "Run with wider DIS range or --all-judgments to grow faster; narrow criminal filter reduces yield.",
    harvest: harvestMeta,
  };
  console.log(JSON.stringify(report, null, 2));
  if (result.records.length === 0 && args.harvest) process.exit(1);
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
