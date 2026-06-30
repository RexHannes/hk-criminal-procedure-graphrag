const fs = require("fs");
const path = require("path");
const {
  CORE_BATCH_GATES,
  evaluateScaleReadiness,
  loadEnv,
  PRODUCTION_SCALE_GATES,
} = require("./scale_readiness");

const ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_QUEUE_PATH = path.join(
  ROOT,
  "data",
  "legal_ingest",
  "criminal_evidence_tree_v1",
  "branch_pilot_queue.json",
);
const DEFAULT_BRANCH_PILOTS_DIR = path.join(
  ROOT,
  "data",
  "legal_ingest",
  "criminal_evidence_tree_v1",
  "branch_pilots",
);

const SCALE_TIERS = {
  branch_landmark_pilot: {
    tier_id: "branch_landmark_pilot",
    label: "Branch landmark pilot (3-5 public cases)",
    max_cases: 5,
    max_cases_per_branch: 20,
    requires_production_stack: false,
    requires_gold_review_set: false,
    allows_cross_domain_write: false,
    required_core_gates: [...CORE_BATCH_GATES],
    blocked_gates: [],
  },
  section_pilot: {
    tier_id: "section_pilot",
    label: "Section pilot (up to 50 cases, review-gated)",
    max_cases: 50,
    max_cases_per_branch: 50,
    requires_production_stack: false,
    requires_gold_review_set: false,
    allows_cross_domain_write: false,
    required_core_gates: [...CORE_BATCH_GATES],
    blocked_gates: [],
  },
  cross_domain_10k: {
    tier_id: "cross_domain_10k",
    label: "Cross-domain 10k public demo write",
    max_cases: 10000,
    max_cases_per_branch: 10000,
    requires_production_stack: true,
    requires_gold_review_set: true,
    allows_cross_domain_write: true,
    required_core_gates: [...CORE_BATCH_GATES, ...PRODUCTION_SCALE_GATES, "bail_gold_review_set_exists"],
    blocked_gates: [],
  },
  cross_domain_20k: {
    tier_id: "cross_domain_20k",
    label: "Cross-domain 20k scale (fully gated)",
    max_cases: 20000,
    max_cases_per_branch: 20000,
    requires_production_stack: true,
    requires_gold_review_set: true,
    allows_cross_domain_write: true,
    required_core_gates: [...CORE_BATCH_GATES, ...PRODUCTION_SCALE_GATES, "bail_gold_review_set_exists"],
    blocked_gates: [],
  },
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function branchPilotDir(branchFamilyId, pilotsDir = DEFAULT_BRANCH_PILOTS_DIR) {
  return path.join(pilotsDir, `${branchFamilyId}_v1`);
}

function branchPilotArtifactStats(branchFamilyId, pilotsDir = DEFAULT_BRANCH_PILOTS_DIR) {
  const pilotDir = branchPilotDir(branchFamilyId, pilotsDir);
  const manifestPath = path.join(pilotDir, "source_manifest.json");
  const parsePath = path.join(pilotDir, "parse_report.json");
  if (!fs.existsSync(manifestPath) || !fs.existsSync(parsePath)) {
    return {
      branch_family_id: branchFamilyId,
      pilot_built: false,
      source_count: 0,
      proposition_count: 0,
      rejected_count: null,
      review_queue_exists: fs.existsSync(path.join(pilotDir, "review_queue.json")),
    };
  }
  const manifest = readJson(manifestPath);
  const parseReport = readJson(parsePath);
  return {
    branch_family_id: branchFamilyId,
    pilot_built: true,
    batch_id: manifest.batch_id,
    source_count: parseReport.source_count || (manifest.sources || []).length,
    paragraph_count: parseReport.paragraph_count || 0,
    proposition_count: parseReport.proposition_count || 0,
    link_count: parseReport.link_count || 0,
    rejected_count: parseReport.rejected_count || 0,
    review_queue_exists: fs.existsSync(path.join(pilotDir, "review_queue.json")),
    pending_landmark_cases: manifest.branch_pilot_resolution?.pending_landmark_cases || [],
  };
}

function selectTier({ tierId, targetCases }) {
  if (tierId) return SCALE_TIERS[tierId] || null;
  if (targetCases <= 5) return SCALE_TIERS.branch_landmark_pilot;
  if (targetCases <= 50) return SCALE_TIERS.section_pilot;
  if (targetCases <= 10000) return SCALE_TIERS.cross_domain_10k;
  return SCALE_TIERS.cross_domain_20k;
}

function evaluateBranchScaleReadiness({
  tierId = "",
  targetCases = 5,
  branchFamilyId = "",
  queuePath = DEFAULT_QUEUE_PATH,
  pilotsDir = DEFAULT_BRANCH_PILOTS_DIR,
  env = loadEnv(),
} = {}) {
  const queue = readJson(queuePath);
  const tier = selectTier({ tierId, targetCases });
  if (!tier) {
    return {
      readiness_id: "hk_criminal_branch_scale_readiness_v1",
      status: "unknown_tier",
      blockers: ["unknown_tier"],
      execution_allowed: false,
    };
  }

  const scaleReadiness = evaluateScaleReadiness({
    targetCases: tier.max_cases,
    env,
  });
  const gateById = new Map((scaleReadiness.gate_results || []).map(item => [item.gate_id, item]));
  const blockers = tier.required_core_gates.filter(id => !gateById.get(id)?.ok).map(id => id);
  const branchEntry = (queue.branches || []).find(item => item.branch_family_id === branchFamilyId);
  const branchStats = branchFamilyId ? branchPilotArtifactStats(branchFamilyId, pilotsDir) : null;

  let branchBlockers = [];
  if (tier.tier_id === "branch_landmark_pilot" && branchFamilyId) {
    if (!branchEntry) branchBlockers.push("unknown_branch_family");
    if (branchStats && !branchStats.pilot_built) branchBlockers.push("branch_pilot_not_built");
    if (branchStats?.pilot_built && branchStats.rejected_count !== 0) branchBlockers.push("branch_pilot_has_rejections");
    if (branchStats?.pilot_built && !branchStats.review_queue_exists) branchBlockers.push("branch_review_queue_missing");
    if (branchStats?.pilot_built && branchStats.source_count > tier.max_cases) {
      branchBlockers.push("branch_pilot_exceeds_max_cases");
    }
  }

  const allBlockers = [...blockers, ...branchBlockers];
  const executionAllowed = allBlockers.length === 0;
  let status = "green_for_requested_tier";
  if (!executionAllowed) {
    if (tier.tier_id === "cross_domain_10k" || tier.tier_id === "cross_domain_20k") {
      status = "blocked_cross_domain_scale";
    } else if (tier.tier_id === "section_pilot") {
      status = "blocked_until_section_gates_pass";
    } else {
      status = "blocked_until_branch_pilot_ready";
    }
  }

  return {
    readiness_id: "hk_criminal_branch_scale_readiness_v1",
    generated_at: new Date().toISOString(),
    tier,
    target_cases: targetCases,
    branch_family_id: branchFamilyId || null,
    branch_queue_entry: branchEntry || null,
    branch_pilot: branchStats,
    scale_readiness: {
      target_cases: tier.max_cases,
      status: scaleReadiness.status,
      blockers: scaleReadiness.blockers,
      warnings: scaleReadiness.warnings,
      execution_allowed: scaleReadiness.execution_allowed,
    },
    blockers: allBlockers,
    status,
    execution_allowed: executionAllowed,
    safe_now: {
      branch_level_expansion: true,
      landmark_pilot_3_to_5_cases: tier.tier_id === "branch_landmark_pilot" && executionAllowed,
      section_pilot_up_to_50: tier.tier_id === "section_pilot" && executionAllowed,
      cross_domain_10k_write: tier.tier_id === "cross_domain_10k" && executionAllowed,
    },
    next_safe_action: executionAllowed
      ? tier.tier_id === "branch_landmark_pilot"
        ? `Run review on ${branchFamilyId || "the selected branch"} pilot queue, then expand to 10-20 landmark cases within the same branch family.`
        : tier.tier_id === "section_pilot"
          ? "Proceed with <=50-case section pilot under review gates."
          : "Proceed with sharded cross-domain scale only after all production and gold-review gates are green."
      : tier.tier_id === "cross_domain_10k"
        ? "Do not run cross-domain 10k writes until production embeddings, reranker, durable orchestration and bail gold review are all green."
        : "Build and validate the branch landmark pilot with exact-quote public sources before expanding case count.",
    policy_note: "Branch pilots intentionally stay candidate-only. Cross-domain 10k remains blocked on main/dev until all four production blockers plus gold review are green.",
  };
}

module.exports = {
  DEFAULT_BRANCH_PILOTS_DIR,
  DEFAULT_QUEUE_PATH,
  SCALE_TIERS,
  branchPilotArtifactStats,
  branchPilotDir,
  evaluateBranchScaleReadiness,
  selectTier,
};
