#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_OUTPUT = path.join(
  ROOT,
  "data",
  "legal_ingest",
  "criminal_evidence_tree_v1",
  "case_registry_public_v1.json",
);

const INVESTOR_RECALL_PATH = path.join(
  ROOT,
  "data",
  "legal_ingest",
  "investor_recall",
  "corpus_v1",
  "case_recall_cards.json",
);

const SOURCE_MANIFESTS = [
  {
    batch_id: "criminal_bail_public_batch_v1",
    artifact_dir: path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "bail_public_batch_v1"),
    scope: "bail_only",
  },
  {
    batch_id: "sedition_public_expression_v1",
    artifact_dir: path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "tree_gap_pilots", "sedition_public_expression_v1"),
    scope: "sedition_public_expression",
  },
  {
    batch_id: "public_order_riot_v1",
    artifact_dir: path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "tree_gap_pilots", "public_order_riot_v1"),
    scope: "public_order_riot",
  },
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function parseArgs(argv) {
  const args = { output: DEFAULT_OUTPUT, targetCases: 10000 };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--output") args.output = path.resolve(ROOT, argv[++i] || args.output);
    else if (arg === "--target-cases") args.targetCases = Number(argv[++i] || args.targetCases);
  }
  return args;
}

function collectCases() {
  const seen = new Set();
  const cases = [];
  for (const batch of SOURCE_MANIFESTS) {
    const manifestPath = path.join(batch.artifact_dir, "source_manifest.json");
    if (!fs.existsSync(manifestPath)) continue;
    const manifest = readJson(manifestPath);
    for (const source of manifest.sources || []) {
      const caseId = source.case_id || source.source_id;
      if (!caseId || seen.has(caseId)) continue;
      seen.add(caseId);
      cases.push({
        case_id: caseId,
        case_name: source.case_name || "",
        neutral_citation: source.neutral_citation || "",
        court_level: source.court_level || "",
        source_url_or_path: source.source_url_or_path || source.fetch_url || "",
        batch_id: batch.batch_id,
        scope: batch.scope,
        artifact_dir: path.relative(ROOT, batch.artifact_dir),
        ingestion_status: source.ingestion_status || "source_candidate",
        source_visibility: source.source_visibility || "public_demo",
        tenant_id: source.tenant_id || "public",
      });
    }
  }
  if (fs.existsSync(INVESTOR_RECALL_PATH)) {
    const recall = readJson(INVESTOR_RECALL_PATH);
    for (const card of recall.case_recall_cards || []) {
      const caseId = card.case_id;
      if (!caseId || seen.has(caseId)) continue;
      seen.add(caseId);
      cases.push({
        case_id: caseId,
        case_name: card.case_name || "",
        neutral_citation: card.neutral_citation || "",
        court_level: card.court_level || "",
        source_url_or_path: card.source_url_or_path || "",
        batch_id: "investor_recall_corpus_v1",
        scope: card.criminal_likely ? "criminal_domain_public_cases" : "legalref_recall",
        artifact_dir: path.relative(ROOT, path.dirname(INVESTOR_RECALL_PATH)),
        ingestion_status: card.ingestion_status || "recall_indexed",
        source_visibility: "public_demo",
        tenant_id: "public",
        registry_status: "investor_recall_index",
      });
    }
  }
  return cases.sort((a, b) => a.case_id.localeCompare(b.case_id));
}

function buildRegistry({ targetCases, output }) {
  const seededCases = collectCases();
  const registry = {
    registry_id: "hk_criminal_public_case_registry_v1",
    generated_at: new Date().toISOString(),
    target_cases: targetCases,
    seeded_case_count: seededCases.length,
    pending_discovery_count: Math.max(0, targetCases - seededCases.length),
    source_policy: {
      public_sources_only: true,
      private_or_licensed_sources_allowed: false,
      bulk_auto_attach_allowed: false,
      answer_safe_by_default: false,
    },
    cases: seededCases.map((item, index) => ({
      case_ordinal: index + 1,
      ...item,
      registry_status: item.registry_status || "seeded_with_artifacts",
    })),
    shard_lookup_note: "Shard ordinals map to case_ordinal in this registry. Ordinals beyond seeded_case_count remain pending_discovery until branch discovery adds verified public cases.",
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(registry, null, 2)}\n`);
  return registry;
}

const args = parseArgs(process.argv);
const registry = buildRegistry(args);
console.log(JSON.stringify({
  registry_id: registry.registry_id,
  output: args.output,
  seeded_case_count: registry.seeded_case_count,
  pending_discovery_count: registry.pending_discovery_count,
  target_cases: registry.target_cases,
}, null, 2));
