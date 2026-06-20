#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");
const {
  extractParagraphFromHtmlFile,
  proposeRulesWithDeepSeek,
  writeProposalSet,
} = require("../src/case_graph/deepseek_rule_proposer");
const { validateExtractionRuleProposals } = require("../src/case_graph/validate_extraction_rule_proposals");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_BATCH = path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "bail_public_batch_v1");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const [key, ...rest] = line.split("=");
    const value = rest.join("=").trim().replace(/^['"]|['"]$/g, "");
    if (value) env[key.trim()] = value;
  }
  return env;
}

function loadEnv() {
  return {
    ...parseEnvFile(path.join(ROOT, ".env")),
    ...parseEnvFile(path.join(ROOT, ".env.local")),
    ...process.env,
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function parseArgs(argv) {
  const args = {
    sourceId: "",
    paragraphNo: "",
    htmlPath: "",
    manifest: path.join(DEFAULT_BATCH, "source_manifest.json"),
    allowedNodes: "",
    output: path.join(DEFAULT_BATCH, "semiauto_rule_proposals.deepseek.json"),
    validate: true,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--source-id") args.sourceId = argv[++i] || "";
    else if (arg === "--paragraph-no") args.paragraphNo = argv[++i] || "";
    else if (arg === "--html") args.htmlPath = path.resolve(ROOT, argv[++i] || "");
    else if (arg === "--manifest") args.manifest = path.resolve(ROOT, argv[++i] || args.manifest);
    else if (arg === "--allowed-nodes") args.allowedNodes = (argv[++i] || "").split(",").map(item => item.trim()).filter(Boolean);
    else if (arg === "--output") args.output = path.resolve(ROOT, argv[++i] || args.output);
    else if (arg === "--no-validate") args.validate = false;
  }
  return args;
}

(async () => {
  const args = parseArgs(process.argv);
  if (!args.sourceId || !args.paragraphNo || !args.htmlPath) {
    throw new Error("source-id, paragraph-no and html are required");
  }
  const manifest = readJson(args.manifest);
  const source = (manifest.sources || []).find(item => item.source_id === args.sourceId);
  if (!source) throw new Error(`unknown_source_id:${args.sourceId}`);
  const paragraphText = extractParagraphFromHtmlFile({ htmlPath: args.htmlPath, paragraphNo: args.paragraphNo });
  if (!paragraphText) throw new Error(`paragraph_not_found:${args.paragraphNo}`);
  const proposals = await proposeRulesWithDeepSeek({
    source,
    paragraphNo: args.paragraphNo,
    paragraphText,
    allowedDoctrineNodeIds: args.allowedNodes.length ? args.allowedNodes : manifest.target_doctrine_node_ids || [],
    env: loadEnv(),
  });
  const payload = writeProposalSet({
    outputPath: args.output,
    proposalSetId: `deepseek_${args.sourceId}_p${args.paragraphNo}`,
    proposals,
    source,
  });
  const report = { output: args.output, proposal_count: payload.proposals.length };
  if (args.validate) {
    report.validation = await validateExtractionRuleProposals({
      proposalPath: args.output,
      manifestPath: args.manifest,
      compileRules: true,
    });
  }
  console.log(JSON.stringify(report, null, 2));
})().catch(error => {
  console.error(error.message);
  if (error.payload) console.error(JSON.stringify(error.payload, null, 2));
  process.exit(1);
});
