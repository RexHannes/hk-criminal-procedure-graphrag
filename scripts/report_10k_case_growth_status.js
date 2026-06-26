#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");
const { loadEnv, qdrantRequest } = require("../src/legal_answer/qdrant_retriever");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1");
const DEFAULT_PLAN = path.join(DATA_DIR, "multibranch_expansion_plan_10000.json");
const DEFAULT_OUTPUT = path.join(ROOT, "artifacts", "case_growth_10000_status.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function parseArgs(argv) {
  const args = {
    targetCases: 10000,
    plan: DEFAULT_PLAN,
    output: DEFAULT_OUTPUT,
    liveQdrant: true,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--target-cases") args.targetCases = Number(argv[++i] || args.targetCases);
    else if (arg === "--plan") args.plan = path.resolve(ROOT, argv[++i] || args.plan);
    else if (arg === "--output") args.output = path.resolve(ROOT, argv[++i] || args.output);
    else if (arg === "--no-live-qdrant") args.liveQdrant = false;
  }
  return args;
}

function arrayFromPayload(payload, key) {
  if (Array.isArray(payload)) return payload;
  return payload?.[key] || [];
}

function manifestPaths() {
  const paths = [
    path.join(DATA_DIR, "bail_public_batch_v1", "source_manifest.json"),
  ];
  const pilotsDir = path.join(DATA_DIR, "tree_gap_pilots");
  if (fs.existsSync(pilotsDir)) {
    for (const entry of fs.readdirSync(pilotsDir)) {
      const manifest = path.join(pilotsDir, entry, "source_manifest.json");
      if (fs.existsSync(manifest)) paths.push(manifest);
    }
  }
  return paths.sort();
}

function siblingJson(manifestPath, fileName, key) {
  const filePath = path.join(path.dirname(manifestPath), fileName);
  if (!fs.existsSync(filePath)) return [];
  return arrayFromPayload(readJson(filePath), key);
}

function collectBatches() {
  return manifestPaths().map(manifestPath => {
    const manifest = readJson(manifestPath);
    const sources = manifest.sources || [];
    const paragraphs = siblingJson(manifestPath, "paragraph_cards.json", "paragraph_cards");
    const propositions = siblingJson(manifestPath, "proposition_cards.json", "proposition_cards");
    const missingCitationSources = sources.filter(source => !(source.neutral_citation || source.law_report_citation));
    return {
      batch_id: manifest.batch_id,
      relative_path: path.relative(ROOT, path.dirname(manifestPath)),
      domain_id: manifest.domain_id,
      practice_area: manifest.practice_area || (manifest.domain_id === "criminal_procedure_hk" ? "criminal_procedure" : "criminal_law"),
      scope: manifest.scope,
      source_count: sources.length,
      paragraph_count: paragraphs.length,
      proposition_count: propositions.length,
      answer_safe_count: propositions.filter(card => card.answer_safe === true || card.answer_layer_status === "answer_safe").length,
      public_sources_only: manifest.source_policy?.public_sources_only === true,
      candidate_only_by_default: manifest.source_policy?.answer_safe_by_default === false,
      missing_citation_source_ids: missingCitationSources.map(source => source.case_id || source.source_id),
      source_ids: sources.map(source => source.case_id || source.source_id).filter(Boolean),
    };
  });
}

async function qdrantCollectionInfo(env, collectionName) {
  if (!collectionName) return null;
  const response = await qdrantRequest(env, `/collections/${encodeURIComponent(collectionName)}`);
  const info = response.result || {};
  return {
    name: collectionName,
    points_count: info.points_count || 0,
    vector_size: info.config?.params?.vectors?.size || null,
    distance: info.config?.params?.vectors?.distance || null,
    status: info.status || "unknown",
  };
}

async function qdrantSnapshot(liveQdrant) {
  if (!liveQdrant) return { live: false, collections: [] };
  const env = loadEnv();
  const names = [
    env.QDRANT_COLLECTION_PARAGRAPHS || "hk_legal_paragraphs",
    env.QDRANT_COLLECTION_PROPOSITIONS || "hk_proposition_cards",
    env.QDRANT_COLLECTION_FORMS || "hk_form_metadata",
  ];
  const collections = [];
  for (const name of names) {
    try {
      collections.push(await qdrantCollectionInfo(env, name));
    } catch (error) {
      collections.push({ name, error: error.message });
    }
  }
  return { live: true, collections };
}

async function main() {
  const args = parseArgs(process.argv);
  const batches = collectBatches();
  const sourceIds = new Set(batches.flatMap(batch => batch.source_ids));
  const verifiedCaseArtifactCount = sourceIds.size;
  const plan = fs.existsSync(args.plan) ? readJson(args.plan) : null;
  const totalPlannedQuota = (plan?.branch_allocations || []).reduce((sum, branch) => sum + Number(branch.target_case_quota || 0), 0);
  const qdrant = await qdrantSnapshot(args.liveQdrant);
  const report = {
    report_id: `hk_criminal_case_growth_${args.targetCases}_status_v1`,
    generated_at: new Date().toISOString(),
    target_cases: args.targetCases,
    current_status: "verified_pilot_corpus_plus_10k_candidate_growth_plan",
    accuracy_position: {
      accurately_recallable_10k_completed: false,
      candidate_case_fruits_verified_for_current_pilots: true,
      production_answer_safe_10k_completed: false,
      investor_safe_claim: "10k public-case growth path is planned and gated; current verified corpus is the pilot corpus, not 10k completed cases.",
    },
    current_verified_artifacts: {
      unique_public_case_sources_with_artifacts: verifiedCaseArtifactCount,
      remaining_to_target: Math.max(0, args.targetCases - verifiedCaseArtifactCount),
      batch_count: batches.length,
      paragraph_cards: batches.reduce((sum, batch) => sum + batch.paragraph_count, 0),
      proposition_cards: batches.reduce((sum, batch) => sum + batch.proposition_count, 0),
      answer_safe_cards: batches.reduce((sum, batch) => sum + batch.answer_safe_count, 0),
      batches,
    },
    ten_k_plan: plan ? {
      plan_id: plan.plan_id,
      status: plan.status,
      target_cases: plan.target_cases,
      total_branch_quota: totalPlannedQuota,
      shard_count: (plan.shards || []).length,
      max_cases_per_shard: Math.max(...(plan.shards || [{ max_cases: 0 }]).map(shard => Number(shard.max_cases || 0))),
      branch_count: (plan.branch_allocations || []).length,
      planned_not_executed: plan.status === "planned_candidate_only_not_bulk_executed",
      branch_allocations: (plan.branch_allocations || []).map(branch => ({
        branch_family: branch.branch_family,
        priority: branch.priority,
        target_case_quota: branch.target_case_quota,
        initial_rung_case_count: branch.initial_rung_case_count,
        review_gate_every_cases: branch.review_gate_every_cases,
        answer_safe_allowed: branch.answer_safe_allowed,
      })),
    } : null,
    qdrant,
    gates_before_claiming_10000_accurately_recallable: [
      "resolve each planned case to a public LegalRef/HKLII/Judiciary source with citation and stable source id",
      "fetch and parse numbered paragraphs for each case",
      "verify exact_quote is a substring of the paragraph text",
      "link each proposition only to existing allowed criminal doctrine/procedure nodes",
      "deduplicate by citation/source id/DIS before indexing",
      "upsert only public_demo/public/candidate_only payloads to Qdrant",
      "run branch golden retrieval suites after each shard",
      "keep answer_safe false until human review promotes specific propositions",
    ],
  };
  writeJson(args.output, report);
  console.log(JSON.stringify({
    output: path.relative(ROOT, args.output),
    target_cases: report.target_cases,
    unique_public_case_sources_with_artifacts: verifiedCaseArtifactCount,
    remaining_to_target: report.current_verified_artifacts.remaining_to_target,
    plan_total_branch_quota: totalPlannedQuota,
    plan_shard_count: report.ten_k_plan?.shard_count || 0,
    qdrant_collections: report.qdrant.collections,
    status: "passed_growth_status_report_written",
  }, null, 2));
}

main().catch(error => {
  console.error(error.message);
  if (error.payload) console.error(JSON.stringify(error.payload, null, 2));
  process.exit(1);
});
